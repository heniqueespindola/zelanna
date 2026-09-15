import { ChipRow } from '@/components/ui/ChipRow';
import type { AlertsFilter as AlertsFilterValue } from '@/types/insights';

const OPTIONS: { value: AlertsFilterValue; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'coverage', label: 'Coverage' },
  { value: 'bills', label: 'Bills' },
  { value: 'renewal', label: 'Renewal' },
];

interface Props {
  value: AlertsFilterValue;
  onChange: (value: AlertsFilterValue) => void;
}

export function AlertsFilter({ value, onChange }: Props) {
  return <ChipRow options={OPTIONS} value={value} onChange={onChange} />;
}
