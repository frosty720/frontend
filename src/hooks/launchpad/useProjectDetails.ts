import { launchpadLogger } from '@/lib/logger';
import { useState, useEffect, useCallback, useRef } from 'react'
import { usePublicClient } from 'wagmi'
import { useHydration } from '@/hooks/useHydration'
import { PRESALE_ABI, FAIRLAUNCH_ABI, PRESALE_V3_ABI, FAIRLAUNCH_V3_ABI } from '@/config/abis'

// Types for project data
export interface ProjectData {
  // Database fields (form data)
  id: string
  name: string
  description: string
  websiteUrl?: string
  whitepaperUrl?: string
  githubUrl?: string
  discordUrl?: string
  telegramUrl?: string
  twitterUrl?: string
  additionalSocialUrl?: string
  saleToken: string
  baseToken: string
  tokenRate: string
  liquidityRate?: string
  minContribution?: string
  maxContribution?: string
  softCap: string
  hardCap: string
  liquidityPercent?: string
  presaleStart: string
  presaleEnd: string
  lpLockDuration?: string
  lpRecipient?: string
  contractAddress: string

  // Fairlaunch-specific fields
  buybackRate?: string
  sellingAmount?: string
  isWhitelist?: boolean
  referrer?: string
  fairlaunchStart?: string
  fairlaunchEnd?: string

  // Project type (added during data processing)
  type?: 'presale' | 'fairlaunch'

  // V3-specific fields (populated when dexVersion is 'v3')
  v3PoolAddress?: string
  v3PositionTokenId?: number
  v3PoolFee?: number

  // Subgraph fields (blockchain data)
  status?: 'Active' | 'Successful' | 'Failed' | 'Cancelled' | 'Pending'
  totalRaised?: string
  totalParticipants?: number
  isFinalized?: boolean

  // Contract state fields (live data)
  contractStatus?: number // Raw contract status
  owner?: string
  cancelled?: boolean
  finalized?: boolean
  tokenUnlockTime?: number
  lpTokensWithdrawn?: boolean

  // Computed fields
  progress?: number // percentage of hard cap reached
  timeRemaining?: number // seconds until end
  isActive?: boolean
  canParticipate?: boolean
  isOwner?: boolean // If connected wallet is project owner
}

interface UseProjectDetailsReturn {
  projectData: ProjectData | null
  loading: boolean
  error: string | null
  refetch: () => Promise<void>
  startPolling: () => void
  stopPolling: () => void
}

// Subgraph queries
const PRESALE_QUERY = `
  query GetPresale($id: String!) {
    presale(id: $id) {
      id
      saleToken
      baseToken
      tokenRate
      softCap
      hardCap
      totalRaised
      totalParticipants
      isFinalized
      startTime
      endTime
      creator
    }
  }
`

const FAIRLAUNCH_QUERY = `
  query GetFairlaunch($id: String!) {
    fairlaunch(id: $id) {
      id
      saleToken
      baseToken
      tokenRate
      softCap
      hardCap
      totalRaised
      totalParticipants
      isFinalized
      startTime
      endTime
      creator
    }
  }
`

export function useProjectDetails(contractAddress: string): UseProjectDetailsReturn {
  const [projectData, setProjectData] = useState<ProjectData | null>(null)
  const [loading, setLoading] = useState(true)
  const [isInitialLoad, setIsInitialLoad] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [lastFetchTime, setLastFetchTime] = useState<number>(0)

  const isHydrated = useHydration()
  const pollingIntervalRef = useRef<NodeJS.Timeout | null>(null)
  const isPollingRef = useRef(false)

  // Get wagmi hooks (must be called at top level)
  let publicClient: any = null
  try {
    publicClient = usePublicClient()
  } catch (error) {
    // WagmiProvider not available - this is expected during SSR or before hydration
  }

  // Cache duration: 10 seconds
  const CACHE_DURATION = 10000

  // Create a ref to store the fetch function to avoid dependency issues
  const fetchProjectDataRef = useRef<((force?: boolean) => Promise<void>) | null>(null)
  const contractAddressRef = useRef(contractAddress)

  // Update contract address ref when it changes
  useEffect(() => {
    contractAddressRef.current = contractAddress
  }, [contractAddress])

  // useEffect to define and manage the fetchProjectData function
  useEffect(() => {
    if (!contractAddressRef.current || !isHydrated) {
      setProjectData(null)
      setLoading(false)
      return
    }

    // Stable fetch functions (defined inside useEffect)
    const fetchDatabaseData = async (address: string) => {
      // First try to find as presale
      const presaleResponse = await fetch('/api/graphql', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          query: `
            query GetPresaleByAddress($contractAddress: String!) {
              confirmedProjectByAddress(contractAddress: $contractAddress) {
                id
                name
                description
                websiteUrl
                whitepaperUrl
                githubUrl
                discordUrl
                telegramUrl
                twitterUrl
                additionalSocialUrl
                saleToken
                baseToken
                tokenRate
                liquidityRate
                minContribution
                maxContribution
                softCap
                hardCap
                liquidityPercent
                presaleStart
                presaleEnd
                lpLockDuration
                lpRecipient
                contractAddress
              }
            }
          `,
          variables: { contractAddress: address }
        }),
      })

      const presaleResult = await presaleResponse.json()
      if (!presaleResult.errors && presaleResult.data.confirmedProjectByAddress) {
        return { ...presaleResult.data.confirmedProjectByAddress, type: 'presale' }
      }

      // If not found as presale, try as fairlaunch
      const fairlaunchResponse = await fetch('/api/graphql', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          query: `
            query GetFairlaunchByAddress($contractAddress: String!) {
              confirmedFairlaunchByAddress(contractAddress: $contractAddress) {
                id
                name
                description
                websiteUrl
                whitepaperUrl
                githubUrl
                discordUrl
                telegramUrl
                twitterUrl
                additionalSocialUrl
                saleToken
                baseToken
                buybackRate
                sellingAmount
                softCap
                liquidityPercent
                fairlaunchStart
                fairlaunchEnd
                isWhitelist
                referrer
                contractAddress
              }
            }
          `,
          variables: { contractAddress: address }
        }),
      })

      const fairlaunchResult = await fairlaunchResponse.json()
      if (!fairlaunchResult.errors && fairlaunchResult.data.confirmedFairlaunchByAddress) {
        // Map fairlaunch fields to expected interface
        const fairlaunch = fairlaunchResult.data.confirmedFairlaunchByAddress
        return {
          ...fairlaunch,
          type: 'fairlaunch',
          tokenRate: fairlaunch.buybackRate,
          liquidityRate: '0', // Fairlaunches don't have separate liquidity rate
          minContribution: null,
          maxContribution: null,
          hardCap: fairlaunch.sellingAmount,
          presaleStart: fairlaunch.fairlaunchStart,
          presaleEnd: fairlaunch.fairlaunchEnd,
          lpLockDuration: '0', // Fairlaunches don't have LP lock
          lpRecipient: null
        }
      }

      return null // Not found in either table
    }

    const fetchContractData = async (address: string, type: 'presale' | 'fairlaunch') => {
      try {
        // Skip if wagmi not ready
        if (!publicClient || !isHydrated) {
          launchpadLogger.warn('PublicClient not ready for contract reads')
          return null
        }

        const abi = type === 'presale' ? PRESALE_V3_ABI : FAIRLAUNCH_V3_ABI

        // Use Promise.all for efficient parallel contract reads
        const contractReads = await Promise.all([
          // Get aggregate data
          publicClient.readContract({
            address: address as `0x${string}`,
            abi,
            functionName: 'raisedAmount'
          }) as Promise<bigint>,

          publicClient.readContract({
            address: address as `0x${string}`,
            abi,
            functionName: 'participantCount'
          }) as Promise<bigint>,

          publicClient.readContract({
            address: address as `0x${string}`,
            abi,
            functionName: 'finalized'
          }) as Promise<boolean>,

          // Get presale configuration info
          publicClient.readContract({
            address: address as `0x${string}`,
            abi,
            functionName: type === 'presale' ? 'presaleInfo' : 'fairlaunchInfo'
          }) as Promise<any[]>
        ])

        const [raisedAmount, participantCount, isFinalized, contractInfo] = contractReads

        // Extract timing info from contract info struct
        let startTime, endTime, tokenRate, softCap, hardCap

        if (type === 'presale') {
          // For presale: [saleToken, baseToken, tokenRate, liquidityRate, raiseMin, raiseMax, softCap, hardCap, liquidityPercent, presaleStart, presaleEnd]
          startTime = contractInfo[9] // presaleStart
          endTime = contractInfo[10] // presaleEnd
          tokenRate = contractInfo[2]?.toString() || '0'
          softCap = contractInfo[6]?.toString() || '0'
          hardCap = contractInfo[7]?.toString() || '0'
        } else {
          // For fairlaunch: [saleToken, baseToken, buybackRate, sellingAmount, softCap, liquidityPercent, fairlaunchStart, fairlaunchEnd, isNative, isWhitelist]
          startTime = contractInfo[6] // fairlaunchStart
          endTime = contractInfo[7] // fairlaunchEnd
          tokenRate = contractInfo[2]?.toString() || '0' // buybackRate
          softCap = contractInfo[4]?.toString() || '0'
          hardCap = contractInfo[3]?.toString() || '0' // sellingAmount as hardcap equivalent
        }

        // Format data to match expected interface
        return {
          id: address.toLowerCase(),
          totalRaised: raisedAmount.toString(),
          totalParticipants: Number(participantCount),
          isFinalized,
          startTime: startTime.toString(),
          endTime: endTime.toString(),
          tokenRate,
          softCap,
          hardCap,
          creator: address // Fallback, could be enhanced with owner() call
        }
      } catch (error) {
        launchpadLogger.warn('Contract read failed, using fallback data:', error)
        return null
      }
    }

    const computeProjectStatus = (dbData: any, contractData: any): Partial<ProjectData> => {
      const now = Math.floor(Date.now() / 1000)

      // Use contract data for timing if available, otherwise fall back to database
      const startTime = contractData?.startTime ? parseInt(contractData.startTime) : new Date(dbData.presaleStart).getTime() / 1000
      const endTime = contractData?.endTime ? parseInt(contractData.endTime) : new Date(dbData.presaleEnd).getTime() / 1000

      // Use contract data for raised amount (this is the key fix!)
      const totalRaised = contractData?.totalRaised || '0'
      const hardCap = dbData.hardCap || '0'
      const softCap = dbData.softCap || '0'

      // Calculate progress percentage
      // Convert totalRaised from wei to KLC if it's a large number
      const raisedAmount = parseFloat(totalRaised)
      const raisedInKLC = raisedAmount > 1000000000000000 ? raisedAmount / 1000000000000000000 : raisedAmount
      const hardCapAmount = parseFloat(hardCap)
      const progress = hardCap !== '0' ? (raisedInKLC / hardCapAmount) * 100 : 0

      // Debug logging
      launchpadLogger.debug('Progress calculation:', {
        totalRaised,
        raisedAmount,
        raisedInKLC,
        hardCap,
        hardCapAmount,
        progress
      })

      // Determine status
      let status: ProjectData['status'] = 'Pending'
      let isActive = false
      let canParticipate = false

      // Use contract finalized status if available
      if (contractData?.finalized || contractData?.isFinalized) {
        status = parseFloat(totalRaised) >= parseFloat(softCap) ? 'Successful' : 'Failed'
      } else if (now < startTime) {
        status = 'Pending'
      } else if (now >= startTime && now <= endTime) {
        status = 'Active'
        isActive = true
        canParticipate = true
      } else if (now > endTime) {
        status = parseFloat(totalRaised) >= parseFloat(softCap) ? 'Successful' : 'Failed'
      }

      const timeRemaining = isActive ? Math.max(0, endTime - now) : 0

      return {
        status,
        totalRaised,
        totalParticipants: contractData?.totalParticipants || 0,
        isFinalized: contractData?.finalized || contractData?.isFinalized || false,
        finalized: contractData?.finalized || contractData?.isFinalized || false,
        progress: Math.min(progress, 100),
        timeRemaining,
        isActive,
        canParticipate
      }
    }

    const detectProjectType = async (address: string): Promise<'presale' | 'fairlaunch'> => {
      // If wagmi is not ready, default to presale
      if (!publicClient || !isHydrated) {
        return 'presale'
      }

      try {
        // Try to call presale-specific methods to detect contract type
        const presaleAbi = [
          'function presaleInfo() view returns (address,address,uint256,uint256,uint256,uint256,uint256,uint256,uint256,uint256,uint256)',
          'function buyers(address) view returns (uint256,uint256,bool)'
        ]

        await publicClient.readContract({
          address: address as `0x${string}`,
          abi: presaleAbi,
          functionName: 'presaleInfo'
        })

        return 'presale'
      } catch (presaleError) {
        // If presale methods fail, try fairlaunch methods
        try {
          const fairlaunchAbi = [
            'function fairlaunchInfo() view returns (address,address,uint256,uint256,uint256,uint256,uint256,uint256,bool,bool)',
            'function participants(address) view returns (uint256,uint256,bool)'
          ]

          await publicClient.readContract({
            address: address as `0x${string}`,
            abi: fairlaunchAbi,
            functionName: 'fairlaunchInfo'
          })

          return 'fairlaunch'
        } catch (fairlaunchError) {
          return 'presale' // Default to presale if both fail
        }
      }
    }

    const fetchProjectData = async (force = false, isInitial = false) => {
      // Check cache unless forced
      const now = Date.now()
      if (!force && now - lastFetchTime < CACHE_DURATION && projectData) {
        return
      }

      try {
        // Only show loading spinner on initial load or forced refresh
        if (isInitial || force) {
          setLoading(true)
        }
        setError(null)

        const currentAddress = contractAddressRef.current
        if (!currentAddress) return

        // Validate contract address format
        if (!currentAddress.match(/^0x[a-fA-F0-9]{40}$/)) {
          throw new Error('Invalid contract address format')
        }

        // Fetch database data (required)
        const dbData = await fetchDatabaseData(currentAddress)

        if (!dbData) {
          throw new Error('Project not found')
        }

        // Use project type from database if available, otherwise detect from contract
        const projectType = dbData.type || await detectProjectType(currentAddress)

        // Only the V3 launchpad exists on KalyChain, so there is nothing to detect —
        // the old on-chain probe told V2 and V3 presales apart.

        // Fetch contract data (replaces broken subgraph)
        const contractAggregateData = await fetchContractData(currentAddress, projectType)

        // Fetch live contract data
        let contractData: Record<string, any> = {}
        if (publicClient && isHydrated) {
          try {
            const abi = projectType === 'presale' ? PRESALE_V3_ABI : FAIRLAUNCH_V3_ABI

            // Get basic contract info and status
            const [contractStatus, owner, finalized] = await Promise.all([
              publicClient.readContract({
                address: currentAddress as `0x${string}`,
                abi,
                functionName: 'getStatus'
              }) as Promise<number>,
              publicClient.readContract({
                address: currentAddress as `0x${string}`,
                abi,
                functionName: 'owner'
              }) as Promise<string>,
              publicClient.readContract({
                address: currentAddress as `0x${string}`,
                abi,
                functionName: 'finalized'
              }) as Promise<boolean>
            ])

            contractData = {
              contractStatus,
              owner,
              cancelled: false,
              finalized: finalized,
              isFinalized: finalized,
              tokenUnlockTime: 0,
              lpTokensWithdrawn: false
            }

            // Read V3-specific state when detected
            if (true) {
              try {
                const v3Abi = projectType === 'presale' ? PRESALE_V3_ABI : FAIRLAUNCH_V3_ABI
                const [poolAddress, tokenId, poolFee] = await Promise.all([
                  publicClient.readContract({
                    address: currentAddress as `0x${string}`,
                    abi: v3Abi,
                    functionName: 'v3PoolAddress',
                  }) as Promise<string>,
                  publicClient.readContract({
                    address: currentAddress as `0x${string}`,
                    abi: v3Abi,
                    functionName: 'v3PositionTokenId',
                  }) as Promise<bigint>,
                  publicClient.readContract({
                    address: currentAddress as `0x${string}`,
                    abi: v3Abi,
                    functionName: 'v3PoolFee',
                  }) as Promise<bigint>,
                ])
                contractData.v3PoolAddress = poolAddress as string
                contractData.v3PositionTokenId = Number(tokenId)
                contractData.v3PoolFee = Number(poolFee)
              } catch (v3Error) {
                launchpadLogger.warn('Could not fetch V3-specific contract data:', v3Error)
              }
            }
          } catch (error) {
            launchpadLogger.warn('Could not fetch live contract data:', error)
          }
        }

        // Compute status and merge data using contract data
        const computedFields = computeProjectStatus(dbData, contractAggregateData)

        // Merge all data
        const mergedData: ProjectData = {
          ...dbData,
          type: projectType,
          ...computedFields,
          ...contractData
        }

        setProjectData(mergedData)
        setLastFetchTime(now)

      } catch (err) {
        launchpadLogger.error('Error fetching project data:', err)
        setError(err instanceof Error ? err.message : 'Failed to load project')
      } finally {
        // Only set loading to false if we were showing loading (initial load or forced refresh)
        if (isInitial || force) {
          setLoading(false)
        }
      }
    }

    // Store the function in ref so it can be called by refetch and polling
    fetchProjectDataRef.current = (force = false) => fetchProjectData(force, false)

    // Initial fetch (mark as initial load)
    fetchProjectData(true, true)

    // Set up polling (background updates, no loading spinner)
    const interval = setInterval(() => fetchProjectData(false, false), 30000)

    return () => clearInterval(interval)
  }, [contractAddressRef.current, isHydrated, publicClient]) // Simple stable dependencies

  // Refetch function for manual updates
  const refetch = useCallback(async () => {
    if (fetchProjectDataRef.current) {
      await fetchProjectDataRef.current(true)
    }
  }, [])

  // Polling control functions (currently automatic polling is always active)
  const startPolling = useCallback(() => {
    // Polling is automatically started in useEffect
  }, [])

  const stopPolling = useCallback(() => {
    // Polling is automatically managed in useEffect cleanup
  }, [])

  return {
    projectData,
    loading: loading && isInitialLoad, // Only show loading during initial load
    error,
    refetch,
    startPolling,
    stopPolling
  }
}
