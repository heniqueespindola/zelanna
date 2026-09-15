import { createContext, useContext, useEffect, useState, type PropsWithChildren } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/hooks/useAuth';
import type { UploadedDocument } from '@/types/documents';

type OnboardingContextValue = {
  onboardingCompleted: boolean | null;
  loading: boolean;
  goals: string[];
  setGoals: (goals: string[]) => void;
  uploadedDocument: UploadedDocument | null;
  setUploadedDocument: (doc: UploadedDocument | null) => void;
  markCompleted: (goals: string[]) => Promise<void>;
};

const OnboardingContext = createContext<OnboardingContextValue | undefined>(undefined);

export function OnboardingProvider({ children }: PropsWithChildren) {
  const { session } = useAuth();
  const [onboardingCompleted, setOnboardingCompleted] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);
  const [goals, setGoals] = useState<string[]>([]);
  const [uploadedDocument, setUploadedDocument] = useState<UploadedDocument | null>(null);

  useEffect(() => {
    const userId = session?.user.id;

    if (!userId) {
      Promise.resolve().then(() => {
        setOnboardingCompleted(null);
        setLoading(false);
      });
      return;
    }

    Promise.resolve().then(() => setLoading(true));
    supabase
      .from('users')
      .select('onboarding_completed')
      .eq('id', userId)
      .single()
      .then(({ data, error }) => {
        if (error) console.error('Failed to load onboarding status', error);
        setOnboardingCompleted(data?.onboarding_completed ?? false);
        setLoading(false);
      });
  }, [session?.user.id]);

  const markCompleted = async (completedGoals: string[]) => {
    if (!session?.user.id) return;
    await supabase
      .from('users')
      .update({ onboarding_completed: true, onboarding_goals: completedGoals })
      .eq('id', session.user.id);
    setOnboardingCompleted(true);
  };

  return (
    <OnboardingContext.Provider
      value={{
        onboardingCompleted,
        loading,
        goals,
        setGoals,
        uploadedDocument,
        setUploadedDocument,
        markCompleted,
      }}
    >
      {children}
    </OnboardingContext.Provider>
  );
}

export function useOnboarding(): OnboardingContextValue {
  const ctx = useContext(OnboardingContext);
  if (!ctx) throw new Error('useOnboarding must be used within OnboardingProvider');
  return ctx;
}
