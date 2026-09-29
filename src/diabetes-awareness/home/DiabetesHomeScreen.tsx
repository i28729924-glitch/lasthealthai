import { useState, useEffect, useCallback, FormEvent } from 'react';
import { 
  Bell, User as UserIcon, Activity, Info, AlertTriangle, 
  Check, Camera, Plus, Sparkles, TrendingUp, ChevronRight, 
  ArrowRight, Sprout, X, RotateCw, CheckCircle2, Droplet, 
  Footprints, RefreshCw, Loader2
} from 'lucide-react';
import { UserSharedProfile, BottomTab, ActiveModule } from '../../types';
import { DiabetesAwarenessSettings } from '../types';
import { DiabetesRepository } from '../data/DiabetesRepository';
import { DIABETES_COLORS } from '../constants/colors';

interface Props {
  profile: UserSharedProfile;
  settings?: DiabetesAwarenessSettings;
  onNavigate: (tab: BottomTab) => void;
  onSwitchGoal: (module: ActiveModule) => void;
}

export function DiabetesHomeScreen({ profile, settings, onNavigate, onSwitchGoal }: Props) {
  const [showGoalModal, setShowGoalModal] = useState(false);
  const [showLogGlucoseModal, setShowLogGlucoseModal] = useState(false);
  const [showAddMealModal, setShowAddMealModal] = useState(false);
  const [showAddWaterModal, setShowAddWaterModal] = useState(false);
  const [showLogActivityModal, setShowLogActivityModal] = useState(false);

  // Glucose state
  const [glucoseInput, setGlucoseInput] = useState('128');
  const [readingTiming, setReadingTiming] = useState<'Morning' | 'Before lunch' | 'Evening'>('Morning');
  const [loggedSuccess, setLoggedSuccess] = useState(false);

  // Real Supabase Water & Activity Data
  const [waterConsumedMl, setWaterConsumedMl] = useState<number>(0);
  const [activityMinutes, setActivityMinutes] = useState<number>(0);
  const [activitySteps, setActivitySteps] = useState<number>(0);
  const [isWaterActivityLoading, setIsWaterActivityLoading] = useState<boolean>(true);
  const [waterActivityError, setWaterActivityError] = useState<string | null>(null);

  // Operation loading & feedback states
  const [isAddingWater, setIsAddingWater] = useState(false);
  const [isLoggingActivity, setIsLoggingActivity] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Modal input states
  const [customWaterAmount, setCustomWaterAmount] = useState('250');
  const [customActivityMinutes, setCustomActivityMinutes] = useState('30');
  const [customActivitySteps, setCustomActivitySteps] = useState('');

  const firstName = profile.fullName ? profile.fullName.split(' ')[0] : 'Alex';

  // Determine effective daily goals from Diabetes Settings
  const effectiveWaterGoalMl =
    settings?.daily_water_goal_ml ??
    (settings?.dailyWaterGoalL ? Math.round(settings.dailyWaterGoalL * 1000) : 2400);

  const effectiveActivityGoalMin =
    settings?.daily_activity_goal_min ??
    (settings?.dailyActivityGoalMin ? settings.dailyActivityGoalMin : 30);

  const waterPercent = Math.min(
    100,
    Math.round((waterConsumedMl / Math.max(1, effectiveWaterGoalMl)) * 100)
  );

  const activityPercent = Math.min(
    100,
    Math.round((activityMinutes / Math.max(1, effectiveActivityGoalMin)) * 100)
  );

  const showToast = (message: string) => {
    setToastMessage(message);
    setTimeout(() => {
      setToastMessage(null);
    }, 2500);
  };

  // Fetch real water & activity records from Supabase
  const loadWaterAndActivity = useCallback(async () => {
    setIsWaterActivityLoading(true);
    setWaterActivityError(null);
    try {
      const [waterRes, activityRes] = await Promise.all([
        DiabetesRepository.getTodayWater(),
        DiabetesRepository.getTodayActivity(),
      ]);
      setWaterConsumedMl(waterRes.totalMl);
      setActivityMinutes(activityRes.exerciseMinutes);
      setActivitySteps(activityRes.steps);
    } catch (err: any) {
      console.error('Failed to load diabetes water and activity records:', err);
      const isAuthError = err?.message?.toLowerCase().includes('authentication required') || err?.message?.toLowerCase().includes('signed in');
      if (isAuthError) {
        setWaterConsumedMl(0);
        setActivityMinutes(0);
        setActivitySteps(0);
      } else {
        setWaterActivityError('Unable to sync health records. Tap retry to reload.');
      }
    } finally {
      setIsWaterActivityLoading(false);
    }
  }, []);

  useEffect(() => {
    loadWaterAndActivity();
  }, [loadWaterAndActivity]);

  // Handle adding water (inserts into public.water_records)
  const handleAddWater = async (amountMl: number) => {
    if (isAddingWater || amountMl <= 0) return;
    setIsAddingWater(true);
    try {
      await DiabetesRepository.addWater(amountMl);
      const updated = await DiabetesRepository.getTodayWater();
      setWaterConsumedMl(updated.totalMl);
      showToast(`Logged ${amountMl} ml water! 💧`);
      setShowAddWaterModal(false);
      setCustomWaterAmount('250');
    } catch (err: any) {
      console.error('Failed to add water record:', err);
      const isAuthError = err?.message?.toLowerCase().includes('authentication required') || err?.message?.toLowerCase().includes('signed in');
      showToast(isAuthError ? 'Please sign in to record water intake.' : 'Could not save water record. Please try again.');
    } finally {
      setIsAddingWater(false);
    }
  };

  // Handle quick activity increment
  const handleAddActivityQuick = async (minutesToAdd: number) => {
    if (isLoggingActivity || minutesToAdd <= 0) return;
    setIsLoggingActivity(true);
    try {
      const updated = await DiabetesRepository.addActivityMinutes(minutesToAdd);
      setActivityMinutes(updated.exerciseMinutes);
      setActivitySteps(updated.steps);
      showToast(`Added +${minutesToAdd} min activity! 🏃`);
    } catch (err: any) {
      console.error('Failed to log activity record:', err);
      const isAuthError = err?.message?.toLowerCase().includes('authentication required') || err?.message?.toLowerCase().includes('signed in');
      showToast(isAuthError ? 'Please sign in to record activity.' : 'Could not save activity record. Please try again.');
    } finally {
      setIsLoggingActivity(false);
    }
  };

  // Handle saving custom activity modal
  const handleSaveActivityModal = async (e: FormEvent) => {
    e.preventDefault();
    const minutes = Math.max(0, parseInt(customActivityMinutes, 10) || 0);
    const steps = Math.max(0, parseInt(customActivitySteps, 10) || 0);

    setIsLoggingActivity(true);
    try {
      const updated = await DiabetesRepository.saveTodayActivity({
        exerciseMinutes: minutes,
        steps: steps > 0 ? steps : activitySteps,
      });
      setActivityMinutes(updated.exerciseMinutes);
      setActivitySteps(updated.steps);
      showToast(`Updated activity: ${minutes} min! 🏃`);
      setShowLogActivityModal(false);
    } catch (err: any) {
      console.error('Failed to save activity record:', err);
      const isAuthError = err?.message?.toLowerCase().includes('authentication required') || err?.message?.toLowerCase().includes('signed in');
      showToast(isAuthError ? 'Please sign in to record activity.' : 'Could not save activity record. Please try again.');
    } finally {
      setIsLoggingActivity(false);
    }
  };

  const handleSaveGlucose = (e: FormEvent) => {
    e.preventDefault();
    setLoggedSuccess(true);
    setTimeout(() => {
      setLoggedSuccess(false);
      setShowLogGlucoseModal(false);
    }, 1200);
  };

  return (
    <div className="min-h-screen bg-[#F7FAFC] text-[#12324A] pb-24 font-sans selection:bg-[#1769AA] selection:text-white">
      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed top-16 left-1/2 -translate-x-1/2 bg-[#12324A] text-white text-xs font-semibold px-4 py-2 rounded-full shadow-lg flex items-center gap-2 z-50 animate-in fade-in slide-in-from-top-4 duration-200">
          <CheckCircle2 className="w-4 h-4 text-[#39A982]" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Top Header */}
      <header className="px-5 pt-4 pb-2 flex items-center justify-between sticky top-0 bg-[#F7FAFC]/95 backdrop-blur-md z-30">
        <div>
          <h2 className="text-base font-medium text-[#12324A] flex items-center gap-1.5">
            Good morning, {firstName} <span className="inline-block animate-wave">👋</span>
          </h2>
        </div>

        <div className="flex items-center gap-2.5">
          {/* Notifications */}
          <button 
            onClick={() => onNavigate('coach')}
            className="w-10 h-10 rounded-full bg-white border border-[#DCE7EE] flex items-center justify-center text-[#12324A] relative shadow-2xs hover:bg-[#EAF5FB] transition-colors"
            aria-label="Notifications"
          >
            <Bell className="w-5 h-5 text-[#12324A]" />
            <span className="absolute -top-1 -right-1 bg-[#E8A23A] text-white text-[10px] font-bold w-4 h-4 rounded-full flex items-center justify-center border-2 border-white">
              3
            </span>
          </button>

          {/* User Profile Avatar */}
          <button 
            onClick={() => onNavigate('profile')}
            className="w-10 h-10 rounded-full bg-white border border-[#DCE7EE] flex items-center justify-center text-[#12324A] shadow-2xs hover:bg-[#EAF5FB] transition-colors"
            aria-label="Profile"
          >
            <UserIcon className="w-5 h-5 text-[#12324A]" />
          </button>
        </div>
      </header>

      {/* Main Content */}
      <main className="px-4 space-y-4 mt-1">
        {/* Module Sub-Header & Switch Goal */}
        <div className="flex items-center justify-between px-1">
          <div>
            <h1 className="text-2xl font-black tracking-tight text-[#12324A]">
              Diabetes-Friendly Eating
            </h1>
            <p className="text-xs text-[#536675] mt-0.5">
              Smart choices for steadier glucose.
            </p>
          </div>

          <button 
            onClick={() => setShowGoalModal(true)}
            className="w-10 h-10 rounded-2xl bg-[#12324A] text-white flex items-center justify-center shadow-xs hover:bg-[#1769AA] transition-colors"
            title="Switch Goal or View Details"
          >
            <Activity className="w-5 h-5" />
          </button>
        </div>

        {/* Hero Card: Today's Glucose Overview */}
        <div className="bg-[#12324A] text-white rounded-3xl p-5 shadow-sm relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-white/85 tracking-wide">
              Today's Glucose Overview
            </span>
            <span className="bg-white text-[#12324A] text-[11px] font-bold px-3 py-0.5 rounded-full shadow-2xs">
              In range
            </span>
          </div>

          <div className="mt-3 flex items-end justify-between">
            <div>
              <div className="flex items-baseline">
                <span className="text-4xl font-extrabold tracking-tight">128</span>
                <span className="text-sm font-medium text-white/80 ml-1.5">mg/dL</span>
              </div>
              <p className="text-[11px] text-white/65 mt-1 font-medium">
                Last checked 7:30 AM
              </p>
            </div>

            {/* Sparkline Trend */}
            <div className="flex flex-col items-end">
              <span className="text-[11px] text-white/70 font-medium mb-1.5">7-day trend</span>
              <div className="w-28 h-8">
                <svg viewBox="0 0 120 32" className="w-full h-full overflow-visible">
                  <path
                    d="M 0,22 Q 20,24 35,18 T 65,19 T 95,14 T 115,12"
                    fill="none"
                    stroke="#FFFFFF"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                  {/* End Dot */}
                  <circle cx="115" cy="12" r="3.5" fill="#FFFFFF" />
                </svg>
              </div>
            </div>
          </div>
        </div>

        {/* Section: Your daily picture */}
        <section className="space-y-2.5">
          <div className="flex items-center justify-between px-1">
            <h3 className="text-sm font-bold text-[#12324A]">Your daily picture</h3>
            <button 
              onClick={() => onNavigate('history')}
              className="text-xs font-semibold text-[#1769AA] hover:text-[#12324A] transition-colors"
            >
              View history
            </button>
          </div>

          {/* 2x2 Grid */}
          <div className="grid grid-cols-2 gap-3">
            {/* 1. Avg Glucose */}
            <div className="bg-white rounded-3xl p-4 border border-[#DCE7EE] shadow-2xs flex flex-col justify-between">
              <div className="flex items-center justify-between">
                <div className="w-8 h-8 rounded-xl bg-[#EAF5FB] text-[#1769AA] flex items-center justify-center">
                  <TrendingUp className="w-4 h-4" />
                </div>
                <span className="text-[11px] font-semibold text-[#1769AA] bg-[#EAF5FB] px-2 py-0.5 rounded-full">
                  7-day
                </span>
              </div>
              <div className="mt-3">
                <span className="text-[11px] text-[#536675] font-medium block">Avg Glucose</span>
                <span className="text-lg font-bold text-[#12324A] tracking-tight">128 mg/dL</span>
              </div>
            </div>

            {/* 2. Time in Range */}
            <div className="bg-white rounded-3xl p-4 border border-[#DCE7EE] shadow-2xs flex flex-col justify-between">
              <div className="flex items-center justify-between">
                <div className="w-8 h-8 rounded-xl bg-[#EAF8F2] text-[#39A982] flex items-center justify-center">
                  <Info className="w-4 h-4" />
                </div>
                <span className="text-[11px] font-semibold text-[#39A982] bg-[#EAF8F2] px-2 py-0.5 rounded-full">
                  Good
                </span>
              </div>
              <div className="mt-3">
                <span className="text-[11px] text-[#536675] font-medium block">Time in Range</span>
                <span className="text-lg font-bold text-[#12324A] tracking-tight">82%</span>
              </div>
            </div>

            {/* 3. Glycemic Load */}
            <div className="bg-white rounded-3xl p-4 border border-[#DCE7EE] shadow-2xs flex flex-col justify-between">
              <div className="flex items-center justify-between">
                <div className="w-8 h-8 rounded-xl bg-[#FFF5E5] text-[#E8A23A] flex items-center justify-center">
                  <AlertTriangle className="w-4 h-4" />
                </div>
                <span className="text-[11px] font-semibold text-[#E8A23A] bg-[#FFF5E5] px-2 py-0.5 rounded-full">
                  Moderate
                </span>
              </div>
              <div className="mt-3">
                <span className="text-[11px] text-[#536675] font-medium block">Glycemic Load</span>
                <span className="text-lg font-bold text-[#12324A] tracking-tight">68</span>
              </div>
            </div>

            {/* 4. Daily Goal */}
            <div className="bg-white rounded-3xl p-4 border border-[#DCE7EE] shadow-2xs flex flex-col justify-between">
              <div className="flex items-center justify-between">
                <div className="w-8 h-8 rounded-xl bg-[#EAF8F2] text-[#39A982] flex items-center justify-center">
                  <Check className="w-4 h-4" />
                </div>
                <span className="text-[11px] font-semibold text-[#39A982] bg-[#EAF8F2] px-2 py-0.5 rounded-full">
                  On track
                </span>
              </div>
              <div className="mt-3">
                <span className="text-[11px] text-[#536675] font-medium block">Daily Goal</span>
                <span className="text-lg font-bold text-[#12324A] tracking-tight">85%</span>
              </div>
            </div>
          </div>
        </section>

        {/* =========================================================================
            PHASE 3: DIABETES WATER & ACTIVITY TRACKING (Real Supabase Integration)
            ========================================================================= */}
        <section className="space-y-2.5">
          <div className="flex items-center justify-between px-1">
            <h3 className="text-sm font-bold text-[#12324A]">Hydration & Activity</h3>
            {isWaterActivityLoading ? (
              <span className="text-[11px] text-[#536675] flex items-center gap-1">
                <Loader2 className="w-3 h-3 animate-spin text-[#1769AA]" /> Syncing...
              </span>
            ) : waterActivityError ? (
              <button 
                onClick={loadWaterAndActivity}
                className="text-xs font-semibold text-[#D95C5C] hover:underline flex items-center gap-1"
              >
                <RefreshCw className="w-3 h-3" /> Retry
              </button>
            ) : (
              <span className="text-[11px] font-medium text-[#536675]">Today's Habits</span>
            )}
          </div>

          {/* Error Banner with Retry */}
          {waterActivityError && (
            <div className="p-3.5 bg-[#FFF5E5] border border-[#E8A23A]/30 rounded-2xl flex items-center justify-between text-xs text-[#12324A] shadow-2xs">
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-[#E8A23A] shrink-0" />
                <span>{waterActivityError}</span>
              </div>
              <button 
                onClick={loadWaterAndActivity}
                className="font-bold text-[#1769AA] hover:underline shrink-0 ml-2"
              >
                Retry
              </button>
            </div>
          )}

          {/* 2-Card Row: Water Intake & Daily Activity */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {/* 1. Water Intake Card (Connected to public.water_records) */}
            <div className="bg-white rounded-3xl p-4 border border-[#DCE7EE] shadow-2xs space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="w-9 h-9 rounded-2xl bg-[#EAF5FB] text-[#2C7A93] flex items-center justify-center">
                    <Droplet className="w-5 h-5 fill-current" />
                  </div>
                  <div>
                    <span className="text-[11px] text-[#536675] font-medium block">Water Intake</span>
                    <div className="text-sm font-extrabold text-[#12324A]">
                      {isWaterActivityLoading ? (
                        <span className="text-xs font-normal text-[#536675] animate-pulse">Syncing...</span>
                      ) : (
                        <>
                          {waterConsumedMl} ml <span className="text-xs font-normal text-[#536675]">/ {effectiveWaterGoalMl} ml</span>
                        </>
                      )}
                    </div>
                  </div>
                </div>

                <span className="text-xs font-bold text-[#1769AA] bg-[#EAF5FB] px-2 py-0.5 rounded-full">
                  {isWaterActivityLoading ? '...' : `${waterPercent}%`}
                </span>
              </div>

              {/* Progress bar */}
              <div className="w-full h-2 bg-[#EAF5FB] rounded-full overflow-hidden">
                <div 
                  className="h-full bg-[#1769AA] rounded-full transition-all duration-300"
                  style={{ width: `${isWaterActivityLoading ? 0 : waterPercent}%` }}
                />
              </div>

              {!isWaterActivityLoading && waterConsumedMl === 0 && (
                <p className="text-[10px] text-[#536675] font-medium">No water logged yet today. Tap + to add.</p>
              )}

              {/* Action Buttons */}
              <div className="flex items-center gap-2 pt-1">
                <button
                  type="button"
                  disabled={isAddingWater}
                  onClick={() => handleAddWater(250)}
                  className="flex-1 py-1.5 px-2 bg-[#F7FAFC] border border-[#DCE7EE] hover:bg-[#EAF5FB] text-[#12324A] rounded-xl text-xs font-semibold flex items-center justify-center gap-1 transition-colors disabled:opacity-50 cursor-pointer"
                  title="Add 250 ml water"
                >
                  <Plus className="w-3.5 h-3.5 text-[#1769AA]" />
                  <span>+250 ml</span>
                </button>

                <button
                  type="button"
                  disabled={isAddingWater}
                  onClick={() => handleAddWater(500)}
                  className="flex-1 py-1.5 px-2 bg-[#F7FAFC] border border-[#DCE7EE] hover:bg-[#EAF5FB] text-[#12324A] rounded-xl text-xs font-semibold flex items-center justify-center gap-1 transition-colors disabled:opacity-50 cursor-pointer"
                  title="Add 500 ml water"
                >
                  <Plus className="w-3.5 h-3.5 text-[#1769AA]" />
                  <span>+500 ml</span>
                </button>

                <button
                  type="button"
                  onClick={() => setShowAddWaterModal(true)}
                  className="p-1.5 bg-[#EAF5FB] border border-[#DCE7EE] hover:bg-[#D4EAF7] text-[#1769AA] rounded-xl text-xs font-bold transition-colors cursor-pointer"
                  title="Custom water amount"
                  aria-label="Custom Water Amount"
                >
                  <Plus className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* 2. Daily Activity Card (Connected to public.activity_daily_records) */}
            <div className="bg-white rounded-3xl p-4 border border-[#DCE7EE] shadow-2xs space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="w-9 h-9 rounded-2xl bg-[#EAF8F2] text-[#39A982] flex items-center justify-center">
                    <Footprints className="w-5 h-5" />
                  </div>
                  <div>
                    <span className="text-[11px] text-[#536675] font-medium block">Daily Activity</span>
                    <div className="text-sm font-extrabold text-[#12324A]">
                      {isWaterActivityLoading ? (
                        <span className="text-xs font-normal text-[#536675] animate-pulse">Syncing...</span>
                      ) : (
                        <>
                          {activityMinutes} min <span className="text-xs font-normal text-[#536675]">/ {effectiveActivityGoalMin} min</span>
                        </>
                      )}
                    </div>
                  </div>
                </div>

                <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                  activityPercent >= 100 
                    ? 'bg-[#EAF8F2] text-[#39A982]' 
                    : 'bg-[#F7FAFC] text-[#536675] border border-[#DCE7EE]'
                }`}>
                  {isWaterActivityLoading ? '...' : `${activityPercent}%`}
                </span>
              </div>

              {/* Progress bar */}
              <div className="w-full h-2 bg-[#EAF8F2] rounded-full overflow-hidden">
                <div 
                  className="h-full bg-[#39A982] rounded-full transition-all duration-300"
                  style={{ width: `${isWaterActivityLoading ? 0 : activityPercent}%` }}
                />
              </div>

              {!isWaterActivityLoading && activityMinutes === 0 && (
                <p className="text-[10px] text-[#536675] font-medium">No activity logged yet today. Tap + to add.</p>
              )}

              {/* Action Buttons */}
              <div className="flex items-center gap-2 pt-1">
                <button
                  type="button"
                  disabled={isLoggingActivity}
                  onClick={() => handleAddActivityQuick(15)}
                  className="flex-1 py-1.5 px-2 bg-[#F7FAFC] border border-[#DCE7EE] hover:bg-[#EAF8F2] text-[#12324A] rounded-xl text-xs font-semibold flex items-center justify-center gap-1 transition-colors disabled:opacity-50 cursor-pointer"
                  title="Add 15 min walk or exercise"
                >
                  <Plus className="w-3.5 h-3.5 text-[#39A982]" />
                  <span>+15 min</span>
                </button>

                <button
                  type="button"
                  disabled={isLoggingActivity}
                  onClick={() => handleAddActivityQuick(30)}
                  className="flex-1 py-1.5 px-2 bg-[#F7FAFC] border border-[#DCE7EE] hover:bg-[#EAF8F2] text-[#12324A] rounded-xl text-xs font-semibold flex items-center justify-center gap-1 transition-colors disabled:opacity-50 cursor-pointer"
                  title="Add 30 min exercise"
                >
                  <Plus className="w-3.5 h-3.5 text-[#39A982]" />
                  <span>+30 min</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setCustomActivityMinutes(String(activityMinutes || 30));
                    setCustomActivitySteps(activitySteps > 0 ? String(activitySteps) : '');
                    setShowLogActivityModal(true);
                  }}
                  className="p-1.5 bg-[#EAF8F2] border border-[#D1EAE0] hover:bg-[#D5EFE2] text-[#39A982] rounded-xl text-xs font-bold transition-colors cursor-pointer"
                  title="Set or update activity"
                  aria-label="Set or update activity"
                >
                  <Plus className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        </section>

        {/* Section: Quick actions */}
        <section className="space-y-2.5">
          <h3 className="text-sm font-bold text-[#12324A] px-1">Quick actions</h3>
          <div className="grid grid-cols-2 gap-3">
            {/* Scan Food */}
            <button 
              onClick={() => setShowAddMealModal(true)}
              className="bg-white rounded-3xl p-4 border border-[#DCE7EE] shadow-2xs text-center hover:bg-[#F7FAFC] transition-colors group cursor-pointer"
            >
              <div className="w-11 h-11 rounded-full bg-[#FDEEEE] text-[#D95C5C] flex items-center justify-center mx-auto mb-2 transition-transform group-hover:scale-105">
                <Camera className="w-5 h-5" />
              </div>
              <span className="text-xs font-bold text-[#12324A] block">Scan Food</span>
            </button>

            {/* Add Meal */}
            <button 
              onClick={() => setShowAddMealModal(true)}
              className="bg-white rounded-3xl p-4 border border-[#DCE7EE] shadow-2xs text-center hover:bg-[#F7FAFC] transition-colors group cursor-pointer"
            >
              <div className="w-11 h-11 rounded-full bg-[#EAF8F2] text-[#39A982] flex items-center justify-center mx-auto mb-2 transition-transform group-hover:scale-105">
                <Plus className="w-5 h-5" />
              </div>
              <span className="text-xs font-bold text-[#12324A] block">Add Meal</span>
            </button>

            {/* Log Glucose */}
            <button 
              onClick={() => setShowLogGlucoseModal(true)}
              className="bg-white rounded-3xl p-4 border border-[#DCE7EE] shadow-2xs text-center hover:bg-[#F7FAFC] transition-colors group cursor-pointer"
            >
              <div className="w-11 h-11 rounded-full bg-[#EAF5FB] text-[#4DA3D9] flex items-center justify-center mx-auto mb-2 transition-transform group-hover:scale-105">
                <TrendingUp className="w-5 h-5" />
              </div>
              <span className="text-xs font-bold text-[#12324A] block">Log Glucose</span>
            </button>

            {/* AI Insight */}
            <button 
              onClick={() => onNavigate('coach')}
              className="bg-white rounded-3xl p-4 border border-[#DCE7EE] shadow-2xs text-center hover:bg-[#F7FAFC] transition-colors group cursor-pointer"
            >
              <div className="w-11 h-11 rounded-full bg-[#FFF5E5] text-[#E8A23A] flex items-center justify-center mx-auto mb-2 transition-transform group-hover:scale-105">
                <Sparkles className="w-5 h-5" />
              </div>
              <span className="text-xs font-bold text-[#12324A] block">AI Insight</span>
            </button>
          </div>
        </section>

        {/* AI Diabetes Coach Card */}
        <div className="bg-white rounded-3xl p-5 border border-[#DCE7EE] shadow-2xs space-y-3.5">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-2xl bg-[#EAF5FB] text-[#1769AA] flex items-center justify-center shrink-0">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <h4 className="text-sm font-bold text-[#12324A]">AI Diabetes Coach</h4>
              <p className="text-xs text-[#536675] mt-0.5">
                Personalized tips for stable blood sugar.
              </p>
            </div>
          </div>

          <button 
            onClick={() => onNavigate('coach')}
            className="w-full bg-[#12324A] text-white font-semibold text-xs py-3.5 px-4 rounded-2xl flex items-center justify-center gap-1.5 hover:bg-[#1769AA] transition-colors shadow-2xs cursor-pointer"
          >
            <span>Ask AI Coach</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>

        {/* Daily Tip Card */}
        <div className="bg-[#1E6847] text-white rounded-3xl p-4 shadow-2xs flex items-center gap-3.5">
          <div className="w-10 h-10 rounded-2xl bg-white/20 text-white flex items-center justify-center shrink-0">
            <Sprout className="w-5 h-5" />
          </div>
          <div className="space-y-0.5">
            <span className="text-xs font-bold block">Daily tip</span>
            <p className="text-xs text-white/90 leading-snug">
              Choose whole foods and control portions to keep glucose steady.
            </p>
          </div>
        </div>
      </main>

      {/* Floating Action Button (+) */}
      <button
        onClick={() => setShowLogGlucoseModal(true)}
        className="fixed bottom-20 right-5 w-12 h-12 rounded-full bg-black text-white shadow-xl flex items-center justify-center hover:scale-105 active:scale-95 transition-all z-30 cursor-pointer"
        aria-label="Quick Action"
      >
        <Plus className="w-6 h-6 stroke-[2.5]" />
      </button>

      {/* Switch Goal Modal */}
      {showGoalModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-end sm:items-center justify-center z-50 p-4">
          <div className="bg-white w-full max-w-sm rounded-3xl p-5 border border-[#DCE7EE] shadow-2xl space-y-4 animate-in fade-in slide-in-from-bottom-6 duration-200">
            <div className="flex items-center justify-between pb-1 border-b border-[#DCE7EE]">
              <div className="flex items-center gap-2">
                <RotateCw className="w-4 h-4 text-[#1769AA]" />
                <h3 className="font-bold text-base text-[#12324A]">Switch Active Goal</h3>
              </div>
              <button 
                onClick={() => setShowGoalModal(false)}
                className="w-8 h-8 rounded-full bg-[#F7FAFC] text-[#536675] flex items-center justify-center hover:bg-[#DCE7EE] cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-xs text-[#536675]">
              VitaAI seamlessly switches your dashboard and daily targets while keeping your one shared profile intact.
            </p>

            <div className="space-y-2.5">
              {/* Option 1: Cancer Awareness */}
              <div 
                onClick={() => {
                  onSwitchGoal('cancer_awareness');
                  setShowGoalModal(false);
                }}
                className="p-3.5 rounded-2xl border border-[#DCE7EE] hover:bg-[#EFE7F5] cursor-pointer transition-colors"
              >
                <div className="font-semibold text-sm text-[#12324A]">Cancer Awareness</div>
                <div className="text-xs text-[#536675] mt-0.5">Cancer-Aware Nutrition & Cellular Wellness</div>
              </div>

              {/* Option 2: Diabetes Awareness (Active) */}
              <div className="p-3.5 rounded-2xl border-2 border-[#1769AA] bg-[#EAF5FB]">
                <div className="flex items-center justify-between">
                  <div className="font-bold text-sm text-[#12324A]">Diabetes Awareness</div>
                  <span className="text-[10px] font-bold text-[#1769AA] bg-white px-2 py-0.5 rounded-full">ACTIVE</span>
                </div>
                <div className="text-xs text-[#536675] mt-0.5">Diabetes-Friendly Eating & Glycemic Control</div>
              </div>

              {/* Option 3: 3 Modules */}
              <div 
                onClick={() => {
                  onSwitchGoal('weight_loss');
                  setShowGoalModal(false);
                }}
                className="p-3.5 rounded-2xl border border-[#DCE7EE] hover:bg-[#EFF6F1] cursor-pointer transition-colors"
              >
                <div className="font-semibold text-sm text-[#12324A]">3 Modules</div>
                <div className="text-xs font-semibold text-[#4C5F55] mt-0.5 tracking-tight">Cancer Awareness • Diabetes • Weight Loss</div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Log Glucose Modal */}
      {showLogGlucoseModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-end sm:items-center justify-center z-50 p-4">
          <div className="bg-white w-full max-w-sm rounded-3xl p-5 border border-[#DCE7EE] shadow-2xl space-y-4 animate-in fade-in slide-in-from-bottom-6 duration-200">
            <div className="flex items-center justify-between pb-1 border-b border-[#DCE7EE]">
              <div className="flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-[#1769AA]" />
                <h3 className="font-bold text-base text-[#12324A]">Log Glucose Reading</h3>
              </div>
              <button 
                onClick={() => setShowLogGlucoseModal(false)}
                className="w-8 h-8 rounded-full bg-[#F7FAFC] text-[#536675] flex items-center justify-center hover:bg-[#DCE7EE] cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {loggedSuccess ? (
              <div className="py-6 text-center space-y-2">
                <CheckCircle2 className="w-12 h-12 text-[#39A982] mx-auto animate-bounce" />
                <h4 className="font-bold text-sm text-[#12324A]">Reading Logged!</h4>
                <p className="text-xs text-[#536675]">Your daily trend has been updated.</p>
              </div>
            ) : (
              <form onSubmit={handleSaveGlucose} className="space-y-3.5">
                <div>
                  <label className="text-xs font-semibold text-[#536675] block mb-1">
                    Blood Glucose Level (mg/dL)
                  </label>
                  <input
                    type="number"
                    value={glucoseInput}
                    onChange={(e) => setGlucoseInput(e.target.value)}
                    className="w-full bg-[#F7FAFC] border border-[#DCE7EE] rounded-2xl px-4 py-2.5 text-base font-bold text-[#12324A] focus:outline-none focus:border-[#1769AA]"
                    placeholder="128"
                    min="40"
                    max="400"
                    required
                  />
                  <span className="text-[11px] text-[#39A982] font-medium block mt-1">
                    Target range: 70–180 mg/dL (In range)
                  </span>
                </div>

                <div>
                  <label className="text-xs font-semibold text-[#536675] block mb-1">Timing</label>
                  <div className="grid grid-cols-3 gap-2">
                    {(['Morning', 'Before lunch', 'Evening'] as const).map((t) => (
                      <button
                        key={t}
                        type="button"
                        onClick={() => setReadingTiming(t)}
                        className={`py-2 text-xs font-semibold rounded-xl border transition-colors cursor-pointer ${
                          readingTiming === t 
                            ? 'bg-[#12324A] text-white border-[#12324A]' 
                            : 'bg-[#F7FAFC] text-[#536675] border-[#DCE7EE]'
                        }`}
                      >
                        {t}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="pt-2">
                  <button
                    type="submit"
                    className="w-full py-3 bg-[#1769AA] text-white font-bold text-xs rounded-2xl hover:bg-[#12324A] transition-colors cursor-pointer"
                  >
                    Save Reading
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

      {/* Add Meal Modal */}
      {showAddMealModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-end sm:items-center justify-center z-50 p-4">
          <div className="bg-white w-full max-w-sm rounded-3xl p-5 border border-[#DCE7EE] shadow-2xl space-y-4 animate-in fade-in slide-in-from-bottom-6 duration-200">
            <div className="flex items-center justify-between pb-1 border-b border-[#DCE7EE]">
              <h3 className="font-bold text-base text-[#12324A]">Log Diabetes-Friendly Meal</h3>
              <button 
                onClick={() => setShowAddMealModal(false)}
                className="w-8 h-8 rounded-full bg-[#F7FAFC] text-[#536675] flex items-center justify-center hover:bg-[#DCE7EE] cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-xs text-[#536675]">
              Quickly record your dish to estimate glycemic index and nutrient balance.
            </p>

            <div className="space-y-2">
              <button
                onClick={() => setShowAddMealModal(false)}
                className="w-full p-3 rounded-2xl bg-[#EAF8F2] text-[#39A982] border border-[#D1EAE0] flex items-center justify-between text-left cursor-pointer"
              >
                <div>
                  <span className="text-xs font-bold block">Quinoa & Roasted Veggie Bowl</span>
                  <span className="text-[11px] text-[#536675]">410 kcal · Low GI (34)</span>
                </div>
                <Plus className="w-4 h-4" />
              </button>

              <button
                onClick={() => setShowAddMealModal(false)}
                className="w-full p-3 rounded-2xl bg-[#F7FAFC] text-[#12324A] border border-[#DCE7EE] flex items-center justify-between text-left cursor-pointer"
              >
                <div>
                  <span className="text-xs font-bold block">Grilled Salmon & Steamed Broccoli</span>
                  <span className="text-[11px] text-[#536675]">460 kcal · Low GI (28)</span>
                </div>
                <Plus className="w-4 h-4" />
              </button>
            </div>

            <button
              onClick={() => setShowAddMealModal(false)}
              className="w-full py-2.5 bg-[#1769AA] text-white font-bold text-xs rounded-2xl hover:bg-[#12324A] transition-colors cursor-pointer"
            >
              Done
            </button>
          </div>
        </div>
      )}

      {/* Add Water Modal (Custom Amount) */}
      {showAddWaterModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-end sm:items-center justify-center z-50 p-4">
          <div className="bg-white w-full max-w-sm rounded-3xl p-5 border border-[#DCE7EE] shadow-2xl space-y-4 animate-in fade-in slide-in-from-bottom-6 duration-200">
            <div className="flex items-center justify-between pb-1 border-b border-[#DCE7EE]">
              <div className="flex items-center gap-2">
                <Droplet className="w-4 h-4 text-[#1769AA] fill-current" />
                <h3 className="font-bold text-base text-[#12324A]">Log Water Intake</h3>
              </div>
              <button 
                onClick={() => setShowAddWaterModal(false)}
                className="w-8 h-8 rounded-full bg-[#F7FAFC] text-[#536675] flex items-center justify-center hover:bg-[#DCE7EE] cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-xs text-[#536675]">
              Adequate hydration supports kidney function and helps steady blood glucose levels.
            </p>

            <div className="space-y-3">
              <div>
                <label className="text-xs font-semibold text-[#536675] block mb-1">
                  Amount in Milliliters (ml)
                </label>
                <input
                  type="number"
                  min="50"
                  max="2000"
                  step="50"
                  value={customWaterAmount}
                  onChange={(e) => setCustomWaterAmount(e.target.value)}
                  className="w-full bg-[#F7FAFC] border border-[#DCE7EE] rounded-2xl px-4 py-2.5 text-base font-bold text-[#12324A] focus:outline-none focus:border-[#1769AA]"
                  placeholder="250"
                />
              </div>

              {/* Quick Select Chips */}
              <div className="grid grid-cols-4 gap-2">
                {[150, 250, 350, 500].map((amt) => (
                  <button
                    key={amt}
                    type="button"
                    onClick={() => setCustomWaterAmount(String(amt))}
                    className={`py-2 text-xs font-semibold rounded-xl border transition-colors cursor-pointer ${
                      customWaterAmount === String(amt)
                        ? 'bg-[#1769AA] text-white border-[#1769AA]'
                        : 'bg-[#F7FAFC] text-[#536675] border-[#DCE7EE]'
                    }`}
                  >
                    {amt} ml
                  </button>
                ))}
              </div>

              <div className="pt-2">
                <button
                  type="button"
                  disabled={isAddingWater || (parseInt(customWaterAmount, 10) || 0) <= 0}
                  onClick={() => handleAddWater(parseInt(customWaterAmount, 10) || 250)}
                  className="w-full py-3 bg-[#1769AA] text-white font-bold text-xs rounded-2xl hover:bg-[#12324A] transition-colors cursor-pointer flex items-center justify-center gap-1.5 disabled:opacity-50"
                >
                  {isAddingWater ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <span>Add {customWaterAmount || '250'} ml</span>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Log Activity Modal */}
      {showLogActivityModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-end sm:items-center justify-center z-50 p-4">
          <div className="bg-white w-full max-w-sm rounded-3xl p-5 border border-[#DCE7EE] shadow-2xl space-y-4 animate-in fade-in slide-in-from-bottom-6 duration-200">
            <div className="flex items-center justify-between pb-1 border-b border-[#DCE7EE]">
              <div className="flex items-center gap-2">
                <Footprints className="w-4 h-4 text-[#39A982]" />
                <h3 className="font-bold text-base text-[#12324A]">Log Daily Activity</h3>
              </div>
              <button 
                onClick={() => setShowLogActivityModal(false)}
                className="w-8 h-8 rounded-full bg-[#F7FAFC] text-[#536675] flex items-center justify-center hover:bg-[#DCE7EE] cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-xs text-[#536675]">
              Daily physical activity enhances insulin sensitivity and lowers blood glucose naturally.
            </p>

            <form onSubmit={handleSaveActivityModal} className="space-y-3.5">
              <div>
                <label className="text-xs font-semibold text-[#536675] block mb-1">
                  Exercise / Active Minutes
                </label>
                <input
                  type="number"
                  min="0"
                  max="600"
                  value={customActivityMinutes}
                  onChange={(e) => setCustomActivityMinutes(e.target.value)}
                  className="w-full bg-[#F7FAFC] border border-[#DCE7EE] rounded-2xl px-4 py-2.5 text-base font-bold text-[#12324A] focus:outline-none focus:border-[#39A982]"
                  placeholder="30"
                  required
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-[#536675] block mb-1">
                  Daily Steps (Optional)
                </label>
                <input
                  type="number"
                  min="0"
                  max="50000"
                  value={customActivitySteps}
                  onChange={(e) => setCustomActivitySteps(e.target.value)}
                  className="w-full bg-[#F7FAFC] border border-[#DCE7EE] rounded-2xl px-4 py-2.5 text-base font-bold text-[#12324A] focus:outline-none focus:border-[#39A982]"
                  placeholder="e.g. 5000"
                />
              </div>

              {/* Quick Minutes Presets */}
              <div className="grid grid-cols-4 gap-2">
                {[15, 30, 45, 60].map((mins) => (
                  <button
                    key={mins}
                    type="button"
                    onClick={() => setCustomActivityMinutes(String(mins))}
                    className={`py-2 text-xs font-semibold rounded-xl border transition-colors cursor-pointer ${
                      customActivityMinutes === String(mins)
                        ? 'bg-[#39A982] text-white border-[#39A982]'
                        : 'bg-[#F7FAFC] text-[#536675] border-[#DCE7EE]'
                    }`}
                  >
                    {mins} min
                  </button>
                ))}
              </div>

              <div className="pt-2">
                <button
                  type="submit"
                  disabled={isLoggingActivity}
                  className="w-full py-3 bg-[#39A982] text-white font-bold text-xs rounded-2xl hover:bg-[#1E6847] transition-colors cursor-pointer flex items-center justify-center gap-1.5 disabled:opacity-50"
                >
                  {isLoggingActivity ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <span>Save Activity</span>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
