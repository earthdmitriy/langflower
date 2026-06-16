/** Last path segment of an absolute or relative project directory. */
export const projectFolderName = (projectDir: string): string => {
	const trimmed = projectDir.replace(/[/\\]+$/, '');
	if (trimmed.length === 0) {
		return projectDir;
	}
	const segments = trimmed.split(/[/\\]/);
	return segments[segments.length - 1] ?? trimmed;
};
