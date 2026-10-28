import React, { useMemo } from 'react';
import { useApp } from '../context/AppContext.js';
import { ChevronLeft, ChevronRight } from 'lucide-react';

export interface DateSelectorProps {
  value?: string;
  onChange?: (date: string) => void;
  className?: string;
  id?: string;
  showTodayPill?: boolean;
}

export const DateSelector: React.FC<DateSelectorProps> = ({
  value,
  onChange,
  className = '',
  id,
  showTodayPill = true
}) => {
  const { selectedDate, setSelectedDate, locale, t } = useApp();

  const todayStr = useMemo(() => new Date().toISOString().slice(0, 10), []);

  const getRelativeDateStr = (base: string, offsetDays: number): string => {
    const d = new Date(base + 'T00:00:00');
    d.setDate(d.getDate() + offsetDays);
    return d.toISOString().split('T')[0];
  };

  const yesterdayStr = useMemo(() => getRelativeDateStr(todayStr, -1), [todayStr]);
  const tomorrowStr = useMemo(() => getRelativeDateStr(todayStr, 1), [todayStr]);

  const rawDate = value || selectedDate || todayStr;
  const currentDate = !isNaN(new Date(rawDate + 'T00:00:00').getTime())
    ? rawDate
    : todayStr;

  const isToday = currentDate === todayStr;

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

  const handleJumpToToday = () => {
    if (onChange) {
      onChange(todayStr);
    } else {
      setSelectedDate(todayStr);
    }
  };

  const formattedDate = new Intl.DateTimeFormat(locale === 'es' ? 'es-AR' : 'en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric'
  }).format(new Date(currentDate + 'T00:00:00'));

  let displayDateText = formattedDate;
  if (currentDate === todayStr) {
    displayDateText = t.date?.today || 'Today';
  } else if (currentDate === yesterdayStr) {
    displayDateText = t.date?.yesterday || 'Yesterday';
  } else if (currentDate === tomorrowStr) {
    displayDateText = t.date?.tomorrow || 'Tomorrow';
  }

  return (
    <div
      id={id}
      data-testid={id || 'date-selector'}
      className={`relative inline-flex items-center shrink-0 ${className}`}
    >
      {/* Oval container around date text and arrow buttons (stays strictly anchored) */}
      <div
        data-testid="date-selector-oval"
        className={`flex items-center justify-between bg-slate-900/90 px-1 py-0.5 rounded-full border shadow-md backdrop-blur-md transition-colors w-[156px] sm:w-[168px] shrink-0 ${
          !isToday ? 'border-amber-500/40 bg-slate-900' : 'border-slate-800'
        }`}
      >
        <button
          type="button"
          id="btn-date-prev"
          data-testid="btn-date-prev"
          onClick={handlePrevDay}
          aria-label={t.date?.previousDay || 'Previous day'}
          className="w-8 sm:w-9 min-h-[40px] sm:min-h-[44px] flex items-center justify-center p-1 text-slate-400 hover:text-slate-900 dark:hover:text-white transition-colors active:scale-95 shrink-0"
        >
          <ChevronLeft className="w-4 h-4" />
        </button>

        <span className="text-xs sm:text-xs font-semibold text-slate-800 dark:text-slate-100 capitalize w-[84px] sm:w-[90px] text-center select-none truncate shrink-0">
          {displayDateText}
        </span>

        <button
          type="button"
          id="btn-date-next"
          data-testid="btn-date-next"
          onClick={handleNextDay}
          aria-label={t.date?.nextDay || 'Next day'}
          className="w-8 sm:w-9 min-h-[40px] sm:min-h-[44px] flex items-center justify-center p-1 text-slate-400 hover:text-slate-900 dark:hover:text-white transition-colors active:scale-95 shrink-0"
        >
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>

      {/* Back button positioned outside the oval to the right without shifting the oval */}
      {showTodayPill && !isToday && (
        <div className="absolute left-full ml-1 sm:ml-1.5 flex items-center top-1/2 -translate-y-1/2">
          <button
            type="button"
            id="btn-date-today"
            data-testid="btn-date-today"
            onClick={handleJumpToToday}
            aria-label={t.date?.jumpToToday || 'Back to Today'}
            className="min-h-[28px] sm:min-h-[30px] px-2 sm:px-2.5 py-0.5 rounded-full text-[10px] sm:text-[11px] font-bold bg-amber-400 hover:bg-amber-300 active:scale-95 text-slate-950 shadow-md transition-all flex items-center justify-center shrink-0 cursor-pointer whitespace-nowrap animate-in fade-in zoom-in-95 duration-150"
          >
            {t.date?.back || 'Back'}
          </button>
        </div>
      )}
    </div>
  );
};
