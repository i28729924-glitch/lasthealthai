import { supabase } from '../../core/supabase';
import { DiabetesWaterRecord, DiabetesActivityData } from '../types';

export function getLocalDateString(dateInput?: Date | string): string {
  if (typeof dateInput === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(dateInput.trim())) {
    return dateInput.trim();
  }
  const d = dateInput ? (typeof dateInput === 'string' ? new Date(dateInput) : dateInput) : new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

async function requireAuthUser() {
  const { data: authData, error: authError } = await supabase.auth.getUser();
  if (authError || !authData?.user) {
    throw new Error('Authentication required: You must be signed in to access your diabetes health records.');
  }
  return authData.user;
}

export const DiabetesRepository = {
  /* =========================================================================
     WATER INTAKE (Shared table: public.water_records)
     ========================================================================= */

  /**
   * Fetches today's water records from public.water_records for the authenticated user.
   * Calculates the exact total amount in ml consumed today.
   */
  async getTodayWater(dateInput?: Date | string): Promise<{ totalMl: number; records: DiabetesWaterRecord[] }> {
    try {
      let startOfDay: string;
      let endOfDay: string;
      if (typeof dateInput === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(dateInput.trim())) {
        const [y, m, dStr] = dateInput.trim().split('-').map(Number);
        startOfDay = new Date(y, m - 1, dStr, 0, 0, 0, 0).toISOString();
        endOfDay = new Date(y, m - 1, dStr, 23, 59, 59, 999).toISOString();
      } else {
        const d = dateInput instanceof Date ? dateInput : (dateInput ? new Date(dateInput) : new Date());
        startOfDay = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0).toISOString();
        endOfDay = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999).toISOString();
      }
      const user = await requireAuthUser();

      const { data, error } = await supabase
        .from('water_records')
        .select('id, amount_ml, recorded_at')
        .eq('user_id', user.id)
        .gte('recorded_at', startOfDay)
        .lte('recorded_at', endOfDay)
        .order('recorded_at', { ascending: false });

      if (error) {
        console.error('DiabetesRepository getTodayWater error:', error);
        throw new Error('Unable to load water intake records. Please try again.');
      }

      const records: DiabetesWaterRecord[] = (data || []).map((r) => ({
        id: String(r.id),
        amountMl: Math.max(0, Math.round(Number(r.amount_ml) || 0)),
        recordedAt: r.recorded_at,
      }));

      const totalMl = records.reduce((sum, r) => sum + r.amountMl, 0);

      return { totalMl, records };
    } catch (err) {
      if (err instanceof Error) throw err;
      throw new Error('An unexpected error occurred while loading water records.');
    }
  },

  /**
   * Inserts a new water intake record into public.water_records for the authenticated user.
   */
  async addWater(amountMl: number): Promise<DiabetesWaterRecord> {
    try {
      const user = await requireAuthUser();
      const cleanMl = Math.max(1, Math.round(amountMl));
      const recordedAt = new Date().toISOString();

      const { data, error } = await supabase
        .from('water_records')
        .insert({
          user_id: user.id,
          amount_ml: cleanMl,
          recorded_at: recordedAt,
        })
        .select('id, amount_ml, recorded_at')
        .single();

      if (error) {
        console.error('DiabetesRepository addWater error:', error);
        throw new Error('Failed to record water intake. Please check your connection and try again.');
      }

      return {
        id: String(data.id),
        amountMl: Math.max(0, Math.round(Number(data.amount_ml) || 0)),
        recordedAt: data.recorded_at,
      };
    } catch (err) {
      if (err instanceof Error) throw err;
      throw new Error('An unexpected error occurred while saving water intake.');
    }
  },

  /* =========================================================================
     ACTIVITY (Shared table: public.activity_daily_records)
     ========================================================================= */

  /**
   * Loads today's activity row from public.activity_daily_records for the authenticated user.
   * Returns total exercise_minutes, steps, and session count.
   */
  async getTodayActivity(dateInput?: Date | string): Promise<DiabetesActivityData> {
    try {
      const user = await requireAuthUser();
      const dateStr = getLocalDateString(dateInput);

      const { data, error } = await supabase
        .from('activity_daily_records')
        .select('id, user_id, activity_date, steps, exercise_minutes, exercise_sessions')
        .eq('user_id', user.id)
        .eq('activity_date', dateStr);

      if (error) {
        console.error('DiabetesRepository getTodayActivity error:', error);
        throw new Error('Unable to load daily activity data. Please try again.');
      }

      if (!data || data.length === 0) {
        return {
          exerciseMinutes: 0,
          steps: 0,
          exerciseSessions: 0,
        };
      }

      const firstRow = data[0];
      const exerciseMinutes = data.reduce(
        (sum, r) => sum + Math.max(0, Math.round(Number(r.exercise_minutes) || 0)),
        0
      );
      const steps = data.reduce((sum, r) => sum + Math.max(0, Math.round(Number(r.steps) || 0)), 0);
      const exerciseSessions = data.reduce(
        (sum, r) => sum + Math.max(0, Math.round(Number(r.exercise_sessions) || 0)),
        0
      );

      return {
        exerciseMinutes,
        steps,
        exerciseSessions,
        activityRecordId: firstRow?.id ? String(firstRow.id) : undefined,
      };
    } catch (err) {
      if (err instanceof Error) throw err;
      throw new Error('An unexpected error occurred while loading activity records.');
    }
  },

  /**
   * Saves or updates today's activity record in public.activity_daily_records.
   * Uses an upsert/update pattern based on authenticated user_id and activity_date
   * to avoid creating duplicate rows.
   */
  async saveTodayActivity(payload: {
    exerciseMinutes: number;
    steps?: number;
    exerciseSessions?: number;
    activityDate?: string;
  }): Promise<DiabetesActivityData> {
    try {
      const user = await requireAuthUser();
      const dateToSave = payload.activityDate || getLocalDateString();
      const cleanMinutes = Math.max(0, Math.round(Number(payload.exerciseMinutes) || 0));
      const cleanSteps = Math.max(0, Math.round(Number(payload.steps) || 0));
      const cleanSessions = Math.max(0, Math.round(Number(payload.exerciseSessions) || (cleanMinutes > 0 ? 1 : 0)));
      const nowIso = new Date().toISOString();

      // Check if an activity record exists for today
      const { data: existingRows, error: findError } = await supabase
        .from('activity_daily_records')
        .select('id, steps, exercise_minutes, exercise_sessions')
        .eq('user_id', user.id)
        .eq('activity_date', dateToSave)
        .limit(1);

      if (findError) {
        console.error('DiabetesRepository saveTodayActivity findError:', findError);
        throw new Error('Failed to verify existing activity records.');
      }

      if (existingRows && existingRows.length > 0) {
        const existing = existingRows[0];
        const { data: updated, error: updateError } = await supabase
          .from('activity_daily_records')
          .update({
            exercise_minutes: cleanMinutes,
            steps: payload.steps !== undefined ? cleanSteps : (Number(existing.steps) || 0),
            exercise_sessions: payload.exerciseSessions !== undefined ? cleanSessions : (Number(existing.exercise_sessions) || 1),
            updated_at: nowIso,
          })
          .eq('id', existing.id)
          .eq('user_id', user.id)
          .select('id, user_id, activity_date, steps, exercise_minutes, exercise_sessions')
          .single();

        if (updateError) {
          console.error('DiabetesRepository saveTodayActivity updateError:', updateError);
          throw new Error('Failed to update activity record. Please try again.');
        }

        return {
          exerciseMinutes: Math.max(0, Math.round(Number(updated.exercise_minutes) || 0)),
          steps: Math.max(0, Math.round(Number(updated.steps) || 0)),
          exerciseSessions: Math.max(0, Math.round(Number(updated.exercise_sessions) || 0)),
          activityRecordId: String(updated.id),
        };
      } else {
        const { data: inserted, error: insertError } = await supabase
          .from('activity_daily_records')
          .insert({
            user_id: user.id,
            activity_date: dateToSave,
            exercise_minutes: cleanMinutes,
            steps: cleanSteps,
            exercise_sessions: cleanSessions,
            created_at: nowIso,
            updated_at: nowIso,
          })
          .select('id, user_id, activity_date, steps, exercise_minutes, exercise_sessions')
          .single();

        if (insertError) {
          console.error('DiabetesRepository saveTodayActivity insertError:', insertError);
          throw new Error('Failed to save new activity record. Please try again.');
        }

        return {
          exerciseMinutes: Math.max(0, Math.round(Number(inserted.exercise_minutes) || 0)),
          steps: Math.max(0, Math.round(Number(inserted.steps) || 0)),
          exerciseSessions: Math.max(0, Math.round(Number(inserted.exercise_sessions) || 0)),
          activityRecordId: String(inserted.id),
        };
      }
    } catch (err) {
      if (err instanceof Error) throw err;
      throw new Error('An unexpected error occurred while saving activity.');
    }
  },

  /**
   * Incrementally adds exercise minutes to today's activity total in public.activity_daily_records.
   */
  async addActivityMinutes(minutesToAdd: number): Promise<DiabetesActivityData> {
    try {
      const current = await this.getTodayActivity();
      const updatedMinutes = current.exerciseMinutes + Math.max(1, Math.round(minutesToAdd));
      const updatedSessions = current.exerciseSessions + 1;
      return await this.saveTodayActivity({
        exerciseMinutes: updatedMinutes,
        steps: current.steps,
        exerciseSessions: updatedSessions,
      });
    } catch (err) {
      if (err instanceof Error) throw err;
      throw new Error('An unexpected error occurred while adding activity minutes.');
    }
  },
};
