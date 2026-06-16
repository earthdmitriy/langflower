import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';

export type ThemeId = 'dark' | 'light';

const STORAGE_KEY = 'lf-theme';

@Injectable({ providedIn: 'root' })
export class ThemeService {
	private readonly themeSubject = new BehaviorSubject<ThemeId>(
		this.readStoredTheme(),
	);

	readonly theme$ = this.themeSubject.asObservable();

	constructor() {
		this.applyTheme(this.themeSubject.value);
	}

	get snapshot(): ThemeId {
		return this.themeSubject.value;
	}

	setTheme(theme: ThemeId): void {
		this.themeSubject.next(theme);
		this.applyTheme(theme);
		this.persistTheme(theme);
	}

	toggleTheme(): void {
		this.setTheme(this.snapshot === 'dark' ? 'light' : 'dark');
	}

	private readStoredTheme(): ThemeId {
		if (typeof localStorage === 'undefined') {
			return 'dark';
		}

		const stored = localStorage.getItem(STORAGE_KEY);

		return stored === 'light' ? 'light' : 'dark';
	}

	private persistTheme(theme: ThemeId): void {
		if (typeof localStorage === 'undefined') {
			return;
		}

		localStorage.setItem(STORAGE_KEY, theme);
	}

	private applyTheme(theme: ThemeId): void {
		if (typeof document === 'undefined') {
			return;
		}

		document.documentElement.dataset['theme'] = theme;
	}
}
