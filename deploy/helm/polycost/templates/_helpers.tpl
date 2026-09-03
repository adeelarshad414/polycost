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
