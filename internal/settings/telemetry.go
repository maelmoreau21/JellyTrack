package settings

import "math"

// NormalizeTelemetry mirrors main's supported plugin telemetry configuration.
// Values are sent to the plugin as well as used by the ingest merge policy.
func NormalizeTelemetry(source map[string]any) map[string]any {
	result := map[string]any{"precisionProfile": "very_precise", "playingIntervalSeconds": 5, "pausedIntervalSeconds": 30, "staleSessionTimeoutSeconds": 90, "mergeWindowSeconds": 1800, "seekThresholdSeconds": 20, "trackPauseResume": true, "trackSeek": true, "trackAudioSubtitleChanges": true, "trackSessionEnded": true, "retryQueueSize": 500, "retryFlushBatchSize": 50}
	limits := map[string][2]int{"playingIntervalSeconds": {1, 3600}, "pausedIntervalSeconds": {5, 3600}, "staleSessionTimeoutSeconds": {30, 86400}, "mergeWindowSeconds": {0, 86400}, "seekThresholdSeconds": {5, 300}, "retryQueueSize": {10, 5000}, "retryFlushBatchSize": {1, 500}}
	for key, bounds := range limits {
		value, ok := source[key].(float64)
		if !ok || math.IsNaN(value) || math.IsInf(value, 0) {
			continue
		}
		result[key] = int(math.Max(float64(bounds[0]), math.Min(float64(bounds[1]), math.Round(value))))
	}
	for _, key := range []string{"trackPauseResume", "trackSeek", "trackAudioSubtitleChanges", "trackSessionEnded"} {
		if value, ok := source[key].(bool); ok {
			result[key] = value
		}
	}
	if value, ok := source["precisionProfile"].(string); ok && (value == "balanced" || value == "minimal") {
		result["precisionProfile"] = value
	}
	return result
}
