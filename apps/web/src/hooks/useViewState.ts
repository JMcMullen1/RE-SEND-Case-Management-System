import { useCallback, useEffect, useState } from 'react';
import {
  decodeViewState,
  defaultViewState,
  encodeViewStateToString,
  type ViewState,
} from '@re-send/shared';

const PREF_KEY = 'resend.viewPrefs';

type Prefs = Pick<ViewState, 'mode' | 'columns' | 'density'>;

function loadPrefs(): Partial<Prefs> {
  try {
    return JSON.parse(localStorage.getItem(PREF_KEY) ?? '{}') as Partial<Prefs>;
  } catch {
    return {};
  }
}

function savePrefs(state: ViewState): void {
  const prefs: Prefs = {
    mode: state.mode,
    columns: state.columns,
    density: state.density,
  };
  localStorage.setItem(PREF_KEY, JSON.stringify(prefs));
}

function initialState(): ViewState {
  const search = window.location.search;
  if (search && search.length > 1) return decodeViewState(search);
  return { ...defaultViewState(), ...loadPrefs() };
}

export type UpdateViewState = (
  patch: Partial<ViewState> | ((state: ViewState) => ViewState),
) => void;

/**
 * The single case-list view state, mirrored to the URL so a view can be pasted
 * into a chat, with mode/columns/density also persisted per browser.
 */
export function useViewState(): readonly [ViewState, UpdateViewState] {
  const [state, setState] = useState<ViewState>(initialState);

  useEffect(() => {
    const url = `${window.location.pathname}${encodeViewStateToString(state)}`;
    window.history.replaceState(null, '', url);
    savePrefs(state);
  }, [state]);

  useEffect(() => {
    const onPop = () => setState(decodeViewState(window.location.search));
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  const update = useCallback<UpdateViewState>((patch) => {
    setState((prev) =>
      typeof patch === 'function' ? patch(prev) : { ...prev, ...patch },
    );
  }, []);

  return [state, update] as const;
}
