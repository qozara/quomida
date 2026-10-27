import React, { useState, useEffect, useMemo } from 'react';
import { useApp } from '../context/AppContext.js';
import { ArrowLeft, Trash2, Check, TrendingUp, AlertTriangle } from 'lucide-react';
import { previewNextTrendWeight, roundTo2Decimals } from '@quomida/domain-core';
import { DateSelector } from './DateSelector.js';

export const WeightQuickLogModal: React.FC = () => {
  const {
    isWeightModalOpen,
    setIsWeightModalOpen,
    selectedDate,
    setSelectedDate,
    weightLogs,
    logWeight,
    deleteWeightLog,
    t
  } = useApp();

  const todayStr = useMemo(() => new Date().toISOString().slice(0, 10), []);
  const [modalDate, setModalDate] = useState<string>(selectedDate || todayStr);

  useEffect(() => {
    if (isWeightModalOpen) {
      setModalDate(selectedDate || todayStr);
    }
  }, [isWeightModalOpen, selectedDate, todayStr]);

  const currentLog = useMemo(() => {
    return weightLogs.find((w) => w.date === modalDate);
  }, [weightLogs, modalDate]);

  const latestPriorLog = useMemo(() => {
    const priors = weightLogs
      .filter((w) => w.date < modalDate)
      .sort((a, b) => a.date.localeCompare(b.date));
    return priors.length > 0 ? priors[priors.length - 1] : undefined;
  }, [weightLogs, modalDate]);

  const latestAnyLog = useMemo(() => {
    return weightLogs.length > 0 ? weightLogs[weightLogs.length - 1] : undefined;
  }, [weightLogs]);

  const [weightInput, setWeightInput] = useState<string>('75.0');
  const [noteInput, setNoteInput] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  useEffect(() => {
    if (isWeightModalOpen) {
      if (currentLog) {
        setWeightInput(String(currentLog.weight_kg));
        setNoteInput(currentLog.note || '');
      } else if (latestAnyLog) {
        setWeightInput(String(latestAnyLog.weight_kg));
        setNoteInput('');
      } else {
        setWeightInput('75.0');
        setNoteInput('');
      }
    }
  }, [isWeightModalOpen, currentLog, latestAnyLog, modalDate]);

  if (!isWeightModalOpen) return null;

  const numericWeight = parseFloat(weightInput);
  const isValidWeight = !isNaN(numericWeight) && numericWeight >= 20 && numericWeight <= 500;

  // Live EWMA Trend preview
  const trendPreview = isValidWeight
    ? previewNextTrendWeight(
        latestPriorLog?.trend_weight_kg,
        latestPriorLog?.date,
        numericWeight,
        modalDate
      )
    : undefined;

  const handleStep = (delta: number) => {
    const current = parseFloat(weightInput) || 75.0;
    const next = roundTo2Decimals(current + delta);
    if (next >= 20 && next <= 500) {
      setWeightInput(String(next));
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isValidWeight || isSubmitting) return;

    try {
      setIsSubmitting(true);
      await logWeight(modalDate, roundTo2Decimals(numericWeight), noteInput.trim() || undefined);
      setIsWeightModalOpen(false);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (isSubmitting) return;
    try {
      setIsSubmitting(true);
      await deleteWeightLog(modalDate);
      setIsWeightModalOpen(false);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="weight-quick-log-title"
      className="fixed inset-0 z-50 bg-slate-950 text-slate-100 flex flex-col overflow-y-auto animate-slide-in-right"
    >
      {/* Modern Sticky Navigation Header */}
      <header className="sticky top-0 z-20 bg-slate-950/90 backdrop-blur-md border-b border-slate-800/80 px-4 py-3 flex items-center justify-between shrink-0">
        <button
          id="btn-close-weight-modal"
          data-testid="btn-close-weight-modal"
          onClick={() => setIsWeightModalOpen(false)}
          aria-label="Back"
          className="min-w-[44px] min-h-[44px] p-2 -ml-2 rounded-full hover:bg-slate-800/80 text-slate-300 hover:text-white transition-colors flex items-center justify-center active:scale-95"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <h1 id="weight-quick-log-title" className="text-base sm:text-lg font-bold text-white tracking-wide">
          {t.weight.quickLogTitle}
        </h1>
        <div className="w-[44px]" aria-hidden="true" />
      </header>

      {/* Main Container */}
      <div className="max-w-md mx-auto w-full px-4 py-4 space-y-5 flex-1">
        {/* Date Selector at the top */}
        <div className="flex justify-center pt-1">
          <DateSelector
            value={modalDate}
            onChange={(newDate) => {
              setModalDate(newDate);
              setSelectedDate(newDate);
            }}
          />
        </div>

        {/* Form Body Card */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-lg space-y-4">
          <form onSubmit={handleSave} className="space-y-4">
            {/* Numeric Weight Input with -0.1 / +0.1 Steppers */}
            <div>
              <label
                htmlFor="input-quick-weight"
                className="text-xs font-semibold text-slate-300 block mb-1.5"
              >
                {t.weight.weightKgLabel}
              </label>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  id="btn-step-weight-down"
                  data-testid="btn-step-weight-down"
                  onClick={() => handleStep(-0.1)}
                  aria-label="Decrease weight by 0.1 kg"
                  className="min-w-[44px] min-h-[44px] flex items-center justify-center rounded-xl bg-slate-800 border border-slate-700 hover:bg-slate-700 active:scale-95 text-lg font-bold text-slate-200"
                >
                  -0.1
                </button>

                <div className="relative flex-1">
                  <input
                    id="input-quick-weight"
                    data-testid="input-quick-weight"
                    type="number"
                    step="0.1"
                    min="20"
                    max="500"
                    value={weightInput}
                    onChange={(e) => setWeightInput(e.target.value)}
                    className="w-full text-center text-2xl font-bold bg-slate-800/80 border border-slate-700 focus:border-emerald-500 rounded-xl py-2 px-3 text-white focus:outline-none"
                    autoFocus
                  />
                </div>

                <button
                  type="button"
                  id="btn-step-weight-up"
                  data-testid="btn-step-weight-up"
                  onClick={() => handleStep(0.1)}
                  aria-label="Increase weight by 0.1 kg"
                  className="min-w-[44px] min-h-[44px] flex items-center justify-center rounded-xl bg-slate-800 border border-slate-700 hover:bg-slate-700 active:scale-95 text-lg font-bold text-slate-200"
                >
                  +0.1
                </button>
              </div>
            </div>

            {/* Live EWMA Trend Preview */}
            {trendPreview !== undefined && (
              <div className="flex items-center justify-between p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-xs">
                <div className="flex items-center gap-2 text-emerald-400">
                  <TrendingUp className="w-4 h-4 shrink-0" />
                  <span className="font-semibold">{t.weight.trendPreviewLabel}</span>
                </div>
                <span className="font-bold font-mono text-emerald-300 text-sm">
                  {trendPreview} {t.weight.unitKg}
                </span>
              </div>
            )}

            {/* Optional Note Input */}
            <div>
              <label
                htmlFor="input-quick-weight-note"
                className="text-xs font-semibold text-slate-300 block mb-1.5"
              >
                {t.weight.noteLabel}
              </label>
              <input
                id="input-quick-weight-note"
                data-testid="input-quick-weight-note"
                type="text"
                maxLength={250}
                placeholder={t.weight.notePlaceholder}
                value={noteInput}
                onChange={(e) => setNoteInput(e.target.value)}
                className="w-full bg-slate-800/80 border border-slate-700 focus:border-emerald-500 rounded-xl py-2 px-3 text-sm text-white focus:outline-none placeholder:text-slate-500"
              />
            </div>

            {/* Past Date Warning Banner */}
            {modalDate < todayStr && (
              <div
                data-testid="banner-past-weight-warning"
                className="p-3 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-between gap-2.5 animate-in fade-in duration-200"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
                  <span className="text-xs text-amber-200 font-medium">
                    {currentLog
                      ? (t.weight.pastDateOverwriteWarning || 'A weight of {{weight}} kg is already logged for {{date}}. Saving will update it.')
                          .replace('{{weight}}', String(currentLog.weight_kg))
                          .replace('{{date}}', modalDate)
                      : (t.weight.pastDateWarning || 'Logging weight to past date: {{date}}')
                          .replace('{{date}}', modalDate)}
                  </span>
                </div>
                <button
                  type="button"
                  id="btn-switch-weight-today"
                  data-testid="btn-switch-weight-today"
                  onClick={() => {
                    setModalDate(todayStr);
                    setSelectedDate(todayStr);
                  }}
                  className="px-2.5 py-1 text-xs font-bold bg-amber-400 hover:bg-amber-300 text-slate-950 rounded-lg shrink-0 shadow-sm transition-all active:scale-95 min-h-[36px] flex items-center justify-center cursor-pointer"
                >
                  {t.weight.switchToToday || 'Log to Today instead'}
                </button>
              </div>
            )}

            {/* Action Buttons */}
            <div className="flex items-center gap-2 pt-2">
              {currentLog && (
                <button
                  type="button"
                  id="btn-delete-weight"
                  data-testid="btn-delete-weight"
                  onClick={handleDelete}
                  disabled={isSubmitting}
                  aria-label={t.weight.deleteWeight}
                  className="min-w-[44px] min-h-[44px] px-3 flex items-center justify-center rounded-xl bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/30 transition-all active:scale-95 shrink-0"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              )}

              <button
                type="submit"
                id="btn-save-weight"
                data-testid="btn-save-weight"
                disabled={!isValidWeight || isSubmitting}
                className={`flex-1 min-h-[44px] py-2.5 px-4 rounded-xl disabled:opacity-50 font-bold text-sm flex items-center justify-center gap-2 shadow-lg transition-all active:scale-95 ${
                  modalDate < todayStr
                    ? 'bg-amber-500 hover:bg-amber-400 text-slate-950 shadow-amber-950/40'
                    : 'bg-emerald-500 hover:bg-emerald-400 text-slate-950 shadow-emerald-950/40'
                }`}
              >
                <Check className="w-4 h-4" />
                <span>
                  {modalDate < todayStr
                    ? (currentLog
                        ? (t.weight.updateWeightPast || 'Update Weight for {{date}}').replace('{{date}}', modalDate)
                        : (t.weight.saveWeightPast || 'Save Weight for {{date}}').replace('{{date}}', modalDate))
                    : t.weight.saveWeight}
                </span>
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};
