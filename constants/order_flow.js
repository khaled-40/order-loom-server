export const ORDER_FLOW = [
    {
        key: 'approved',
        next: 'cutting_completed',
        label: 'Cutting Completed',
        defaultLocation: 'Cutting Section',
    },
    {
        key: 'Cutting Completed',
        next: 'sewing_started',
        label: 'Sewing Started',
        defaultLocation: 'Sewing Line',
    },
    {
        key: 'Sewing Started',
        next: 'finishing',
        label: 'Finishing',
        defaultLocation: 'Finishing Section',
    },
    {
        key: 'Finishing',
        next: 'qc_checked',
        label: 'QC Checked',
        defaultLocation: 'QC Department',
    },
    {
        key: 'QC Checked',
        next: 'packed',
        label: 'Packed',
        defaultLocation: 'Packaging Area',
    },
    {
        key: 'packed',
        next: 'shipped',
        label: 'Shipped',
        defaultLocation: 'Dispatch Warehouse',
    },
];
