import React from 'react';
import { useApp } from '../context/AppContext.js';
import { ChevronLeft, ChevronRight } from 'lucide-react';

export interface DateSelectorProps {
  value?: string;
  onChange?: (date: string) => void;
  className?: string;
  id?: string;
}

export const DateSelector: React.FC<DateSelectorProps> = ({
  value,
  onChange,
  className = '',
  id
}) => {
  const { selectedDate, setSelectedDate, locale } = useApp();

  const rawDate = value || selectedDate || new Date().toISOString().slice(0, 10);
  const currentDate = !isNaN(new Date(rawDate + 'T00:00:00').getTime())
    ? rawDate
    : new Date().toISOString().slice(0, 10);

  const handlePrevDay = () => {
    const d = new Date(currentDate + 'T00:00:00');
    d.setDate(d.getDate() - 1);
    const newDate = d.toISOString().split('T')[0];
    if (onChange) {
      onChange(newDate);
    } else {
      setSelectedDate(newDate);
    }
  };

  const handleNextDay = () => {
    const d = new Date(currentDate + 'T00:00:00');
    d.setDate(d.getDate() + 1);
    const newDate = d.toISOString().split('T')[0];
    if (onChange) {
      onChange(newDate);
    } else {
      setSelectedDate(newDate);
    }
  };

  const formattedDate = new Intl.DateTimeFormat(locale === 'es' ? 'es-AR' : 'en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric'
  }).format(new Date(currentDate + 'T00:00:00'));

  return (
    <div
      id={id}
      data-testid={id || 'date-selector'}
      className={`flex items-center gap-1 bg-slate-900/90 px-2 py-0.5 rounded-full border border-slate-800 shadow-md backdrop-blur-md ${className}`}
    >
      <button
        type="button"
        id="btn-date-prev"
        data-testid="btn-date-prev"
        onClick={handlePrevDay}
        aria-label="Previous day"
        className="min-w-[44px] min-h-[44px] flex items-center justify-center p-1 text-slate-400 hover:text-white transition-colors active:scale-95"
      >
        <ChevronLeft className="w-4 h-4" />
      </button>
      <span className="text-xs sm:text-sm font-semibold text-slate-100 capitalize min-w-[85px] sm:min-w-[95px] text-center select-none">
        {formattedDate}
      </span>
      <button
        type="button"
        id="btn-date-next"
        data-testid="btn-date-next"
        onClick={handleNextDay}
        aria-label="Next day"
        className="min-w-[44px] min-h-[44px] flex items-center justify-center p-1 text-slate-400 hover:text-white transition-colors active:scale-95"
      >
        <ChevronRight className="w-4 h-4" />
      </button>
    </div>
  );
};
