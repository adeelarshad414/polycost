{{- define "polycost.name" -}}
{{- default .Chart.Name .Values.nameOverride | trunc 63 | trimSuffix "-" -}}
{{- end -}}

{{- define "polycost.fullname" -}}
{{- printf "%s-%s" .Release.Name (include "polycost.name" .) | trunc 63 | trimSuffix "-" -}}
{{- end -}}

{{- define "polycost.labels" -}}
app.kubernetes.io/name: {{ include "polycost.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
app.kubernetes.io/version: {{ .Chart.AppVersion | quote }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
helm.sh/chart: {{ printf "%s-%s" .Chart.Name .Chart.Version }}
{{- end -}}

{{- define "polycost.selectorLabels" -}}
app.kubernetes.io/name: {{ include "polycost.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
{{- end -}}

{{/*
Image reference (audit H-13). A digest wins over a tag, so a release pins the
exact bytes that were scanned, signed and attested; a tag (default: the chart's
appVersion) is the fallback. `latest` is never implied.
Usage: include "polycost.image" (dict "image" .Values.image "root" .)
*/}}
{{- define "polycost.image" -}}
{{- $image := .image -}}
{{- if $image.digest -}}
{{- printf "%s@%s" $image.repository $image.digest -}}
{{- else -}}
{{- printf "%s:%s" $image.repository (default .root.Chart.AppVersion $image.tag) -}}
{{- end -}}
{{- end -}}
