{{/*
Expand the name of the chart.
*/}}
{{- define "v8platform.name" -}}
{{- default .Chart.Name .Values.nameOverride | trunc 63 | trimSuffix "-" }}
{{- end }}

{{/*
Create a default fully qualified app name.
*/}}
{{- define "v8platform.fullname" -}}
{{- if .Values.fullnameOverride }}
{{- .Values.fullnameOverride | trunc 63 | trimSuffix "-" }}
{{- else }}
{{- $name := default .Chart.Name .Values.nameOverride }}
{{- if contains $name .Release.Name }}
{{- .Release.Name | trunc 63 | trimSuffix "-" }}
{{- else }}
{{- printf "%s-%s" .Release.Name $name | trunc 63 | trimSuffix "-" }}
{{- end }}
{{- end }}
{{- end }}

{{/*
Create chart name and version.
*/}}
{{- define "v8platform.chart" -}}
{{- printf "%s-%s" .Chart.Name .Chart.Version | replace "+" "_" | trunc 63 | trimSuffix "-" }}
{{- end }}

{{/*
Common labels
*/}}
{{- define "v8platform.labels" -}}
helm.sh/chart: {{ include "v8platform.chart" . }}
{{ include "v8platform.selectorLabels" . }}
{{- if .Chart.AppVersion }}
app.kubernetes.io/version: {{ .Chart.AppVersion | quote }}
{{- end }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
{{- end }}

{{/*
Selector labels
*/}}
{{- define "v8platform.selectorLabels" -}}
app.kubernetes.io/name: {{ include "v8platform.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
{{- end }}

{{/*
Create the name of the service account to use
*/}}
{{- define "v8platform.serviceAccountName" -}}
{{- if .Values.serviceAccount.create }}
{{- default (include "v8platform.fullname" .) .Values.serviceAccount.name }}
{{- else }}
{{- default "default" .Values.serviceAccount.name }}
{{- end }}
{{- end }}

{{/*
Database connection string
*/}}
{{- define "v8platform.dbUrl" -}}
{{- $host := .Values.database.host | default (printf "%s-postgresql" .Release.Name) }}
{{- $password := .Values.secrets.dbPassword }}
{{- printf "postgres://%s:%s@%s:%d/%s?sslmode=disable" .Values.database.user $password $host .Values.database.port .Values.database.name }}
{{- end }}
