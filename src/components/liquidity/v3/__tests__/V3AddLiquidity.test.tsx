/**
 * @vitest-environment jsdom
 */
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import React from 'react';
import V3AddLiquidity from '../V3AddLiquidity';
import { useV3AddLiquidity } from '@/hooks/v3/useV3AddLiquidity';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import { Token } from '@/config/dex/types';
import { DictionaryProvider } from '@/i18n/DictionaryProvider';
import en from '@/i18n/dictionaries/en';

// Mock the hook and child components
vi.mock('@/hooks/v3/useV3AddLiquidity');
vi.mock('../TickRangeSelector', () => ({
    default: () => <div data-testid="tick-range-selector">Tick Range Selector</div>
}));

// Mock UI components
vi.mock('@/components/ui/button', () => ({
    Button: (props: any) => <button {...props}>{props.children}</button>
}));
vi.mock('@/components/ui/input', () => ({
    Input: (props: any) => <input {...props} />
}));
vi.mock('@/components/ui/card', () => ({
    Card: ({ children }: any) => <div>{children}</div>,
    CardContent: ({ children }: any) => <div>{children}</div>
}));

function renderComp(props: React.ComponentProps<typeof V3AddLiquidity>) {
    return render(
        <DictionaryProvider dict={en} locale="en">
            <V3AddLiquidity {...props} />
        </DictionaryProvider>,
    );
}

describe('V3AddLiquidity Component', () => {
    const token0: Token = { address: '0x1', decimals: 18, symbol: 'T0', name: 'Token 0', chainId: 1, logoURI: '' };
    const token1: Token = { address: '0x2', decimals: 18, symbol: 'T1', name: 'Token 1', chainId: 1, logoURI: '' };

    // Default hook mock return
    const mockAddLiquidity = vi.fn();

    beforeEach(() => {
        vi.clearAllMocks();
        (useV3AddLiquidity as any).mockReturnValue({
            addLiquidity: mockAddLiquidity,
            isLoading: false,
            error: null
        });
    });

    it('renders amount inputs correctly', () => {
        renderComp({ token0, token1 });

        expect(screen.getByText('T0 Amount')).toBeDefined();
        expect(screen.getByText('T1 Amount')).toBeDefined();
        expect(screen.getAllByPlaceholderText('0.0')).toHaveLength(2);
    });

    it('calls addLiquidity when button is clicked', async () => {
        mockAddLiquidity.mockResolvedValue('0xtxhash');

        renderComp({ token0, token1 });

        // Enter amounts
        // Note: Using getAllByPlaceholderText returns array in order of appearance
        const inputs = screen.getAllByPlaceholderText('0.0');
        fireEvent.change(inputs[0], { target: { value: '10' } });
        fireEvent.change(inputs[1], { target: { value: '20' } });

        // Click button
        const button = screen.getByRole('button', { name: /Add Liquidity/i });
        fireEvent.click(button);

        await waitFor(() => {
            expect(mockAddLiquidity).toHaveBeenCalledWith(
                '10',
                '20',
                -887220, // Default stub values
                887220
            );
        });
    });

    it('disables button when loading', () => {
        (useV3AddLiquidity as any).mockReturnValue({
            addLiquidity: mockAddLiquidity,
            isLoading: true, // Loading
            error: null
        });

        renderComp({ token0, token1 });

        const button = screen.getByRole('button');
        expect((button as HTMLButtonElement).disabled).toBe(true);
        expect(button.textContent).toContain('Adding...');
    });

    it('displays error message from hook', () => {
        (useV3AddLiquidity as any).mockReturnValue({
            addLiquidity: mockAddLiquidity,
            isLoading: false,
            error: 'Simulated error'
        });

        renderComp({ token0, token1 });

        expect(screen.getByText('Simulated error')).toBeDefined();
    });

    it('hides range selector when increasing liquidity (tokenId provided)', () => {
        renderComp({ token0, token1, tokenId: 123n });
        // "Set Price Range" should NOT be present
        expect(screen.queryByText('Set Price Range')).toBeNull();
    });
});
