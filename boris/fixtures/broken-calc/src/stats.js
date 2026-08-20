/**
 * Small statistics helpers used by the fixture project.
 *
 * NOTE: this fixture ships with a deliberate defect so the agent has something real to find,
 * diagnose and repair. Do not "fix" it in the repository — the end-to-end test copies this
 * directory into a scratch workspace and expects the failure to be present.
 */

export function mean(values) {
  if (!Array.isArray(values) || values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

export function median(values) {
  if (!Array.isArray(values) || values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  // Defect: for an even number of samples the median is the mean of the two middle values,
  // but this returns the upper middle value instead.
  return sorted[middle];
}

export function range(values) {
  if (!Array.isArray(values) || values.length === 0) return 0;
  return Math.max(...values) - Math.min(...values);
}
