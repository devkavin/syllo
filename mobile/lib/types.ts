export type Plan = "freshman" | "scholar" | "deans_list" | string;

export interface User {
  user_id: string;
  email: string;
  name: string;
  picture?: string | null;
  auth_provider?: "password" | "google";
  onboarded?: boolean;
  theme?: "light" | "dark";
  timezone_offset_min?: number;
  daily_goal_minutes?: number;
  role?: "user" | "admin";
  plan?: Plan;
  ai_credits_remaining?: number;
  credit_period?: string;
  credit_bonuses?: Record<string, unknown>;
  referral_code?: string;
  referred_by?: string | null;
  created_at?: string;
}

export interface Subject {
  subject_id: string;
  user_id: string;
  name: string;
  color: string;
  description?: string;
  focus_minutes?: number;
  break_minutes?: number;
}

export interface Lesson {
  lesson_id: string;
  subject_id: string;
  user_id: string;
  title: string;
  status?: "planned" | "in_progress" | "done" | string;
  notes?: string;
}

export interface Task {
  task_id: string;
  user_id: string;
  title: string;
  completed?: boolean;
  due_date?: string | null;
  priority?: "low" | "med" | "high";
  subject_id?: string | null;
}

export interface Notebook {
  notebook_id: string;
  user_id: string;
  title: string;
  content?: string;
  subject_id?: string | null;
  updated_at?: string;
}

export interface AuthResponse extends User {
  access_token: string;
  refresh_token: string;
}
