import React, { useState, useEffect, useMemo } from 'react';
import { useApp } from '../context/AppContext.js';
import { X, Scale, Trash2, Check, TrendingUp } from 'lucide-react';
import { previewNextTrendWeight, roundTo2Decimals } from '@quomida/domain-core';

export const WeightQuickLogModal: React.FC = () => {
  const {
    isWeightModalOpen,
    setIsWeightModalOpen,
    selectedDate,
    weightLogs,
    logWeight,
    deleteWeightLog,
    t
  } = useApp();

  const currentLog = useMemo(() => {
    return weightLogs.find((w) => w.date === selectedDate);
  }, [weightLogs, selectedDate]);

  const latestPriorLog = useMemo(() => {
    const priors = weightLogs
      .filter((w) => w.date < selectedDate)
      .sort((a, b) => a.date.localeCompare(b.date));
    return priors.length > 0 ? priors[priors.length - 1] : undefined;
  }, [weightLogs, selectedDate]);

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
  }, [isWeightModalOpen, currentLog, latestAnyLog]);

  if (!isWeightModalOpen) return null;

  const numericWeight = parseFloat(weightInput);
  const isValidWeight = !isNaN(numericWeight) && numericWeight >= 20 && numericWeight <= 500;

  // Live EWMA Trend preview
  const trendPreview = isValidWeight
    ? previewNextTrendWeight(
        latestPriorLog?.trend_weight_kg,
        latestPriorLog?.date,
        numericWeight,
        selectedDate
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
      await logWeight(selectedDate, roundTo2Decimals(numericWeight), noteInput.trim() || undefined);
      setIsWeightModalOpen(false);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (isSubmitting) return;
    try {
      setIsSubmitting(true);
      await deleteWeightLog(selectedDate);
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
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-md animate-in fade-in duration-200"
    >
      <div className="relative w-full max-w-sm bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-2xl space-y-5">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center">
              <Scale className="w-4 h-4 text-emerald-400" />
            </div>
            <div>
              <h2 id="weight-quick-log-title" className="text-base font-bold text-white">
                {t.weight.quickLogTitle}
              </h2>
              <p className="text-xs text-slate-400 font-mono">{selectedDate}</p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => setIsWeightModalOpen(false)}
            aria-label="Close"
            className="min-w-[44px] min-h-[44px] flex items-center justify-center rounded-full bg-slate-800/80 hover:bg-slate-700 text-slate-400 hover:text-white transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body */}
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
              className="flex-1 min-h-[44px] py-2.5 px-4 rounded-xl bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-slate-950 font-bold text-sm flex items-center justify-center gap-2 shadow-lg shadow-emerald-950/40 transition-all active:scale-95"
            >
              <Check className="w-4 h-4" />
              <span>{t.weight.saveWeight}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
