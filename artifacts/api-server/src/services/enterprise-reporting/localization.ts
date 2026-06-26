// ---------------------------------------------------------------------------
// Localization / i18n Service ⭐⭐⭐⭐⭐
// ---------------------------------------------------------------------------
// Multi-language support for the enterprise reporting engine.
// Supports RTL, localized date/number formats, and compliance terminology.

import type { ReportLanguage, LocalizedStrings } from "./types";

// ── Localized Strings ──────────────────────────────────────────────────────

const STRINGS: Record<string, Partial<LocalizedStrings>> = {
  en: {
    reportTitle: "Security Assessment Report",
    executiveSummary: "Executive Summary",
    technicalDetails: "Technical Details",
    findings: "Findings",
    severity: "Severity",
    status: "Status",
    remediation: "Remediation",
    compliance: "Compliance",
    appendices: "Appendices",
    glossary: "Glossary",
    references: "References",
    generatedAt: "Generated at",
    classification: "Classification",
    page: "Page",
    of_: "of",
    tableOfContents: "Table of Contents",
    methodology: "Methodology",
    scope: "Scope",
    assets: "Assets",
    evidence: "Evidence",
    timeline: "Timeline",
    recommendations: "Recommendations",
    nextSteps: "Next Steps",
    riskScore: "Risk Score",
    securityScore: "Security Score",
    critical: "Critical",
    high: "High",
    medium: "Medium",
    low: "Low",
    info: "Info",
    confirmed: "Confirmed",
    falsePositive: "False Positive",
    inconclusive: "Inconclusive",
    pending: "Pending",
  },
  ar: {
    reportTitle: "تقرير تقييم الأمن",
    executiveSummary: "ملخص تنفيذي",
    technicalDetails: "التفاصيل الفنية",
    findings: "النتائج",
    severity: "الخطورة",
    status: "الحالة",
    remediation: "المعالجة",
    compliance: "الامتثال",
    appendices: "الملاحق",
    glossary: "المسرد",
    references: "المراجع",
    generatedAt: "تم الإنشاء في",
    classification: "التصنيف",
    page: "صفحة",
    of_: "من",
    tableOfContents: "جدول المحتويات",
    methodology: "المنهجية",
    scope: "النطاق",
    assets: "الأصول",
    evidence: "الأدلة",
    timeline: "الجدول الزمني",
    recommendations: "التوصيات",
    nextSteps: "الخطوات التالية",
    riskScore: "درجة المخاطر",
    securityScore: "درجة الأمان",
    critical: "حرج",
    high: "عالٍ",
    medium: "متوسط",
    low: "منخفض",
    info: "معلومات",
    confirmed: "مؤكد",
    falsePositive: "إيجابي كاذب",
    inconclusive: "غير حاسم",
    pending: "معلق",
  },
  fr: {
    reportTitle: "Rapport d'Évaluation de Sécurité",
    executiveSummary: "Résumé Exécutif",
    technicalDetails: "Détails Techniques",
    findings: "Résultats",
    severity: "Sévérité",
    status: "Statut",
    remediation: "Correction",
    compliance: "Conformité",
    appendices: "Annexes",
    glossary: "Glossaire",
    references: "Références",
    generatedAt: "Généré le",
    classification: "Classification",
    page: "Page",
    of_: "sur",
    tableOfContents: "Table des Matières",
    methodology: "Méthodologie",
    scope: "Périmètre",
    assets: "Actifs",
    evidence: "Preuves",
    timeline: "Chronologie",
    recommendations: "Recommandations",
    nextSteps: "Prochaines Étapes",
    riskScore: "Score de Risque",
    securityScore: "Score de Sécurité",
    critical: "Critique",
    high: "Élevée",
    medium: "Moyenne",
    low: "Faible",
    info: "Info",
    confirmed: "Confirmé",
    falsePositive: "Faux Positif",
    inconclusive: "Non Concluant",
    pending: "En Attente",
  },
  de: {
    reportTitle: "Sicherheitsbewertungsbericht",
    executiveSummary: "Zusammenfassung",
    technicalDetails: "Technische Details",
    findings: "Ergebnisse",
    severity: "Schweregrad",
    status: "Status",
    remediation: "Behebung",
    compliance: "Konformität",
    appendices: "Anhänge",
    glossary: "Glossar",
    references: "Referenzen",
    generatedAt: "Generiert am",
    classification: "Klassifizierung",
    page: "Seite",
    of_: "von",
    tableOfContents: "Inhaltsverzeichnis",
    methodology: "Methodik",
    scope: "Umfang",
    assets: "Vermögenswerte",
    evidence: "Beweise",
    timeline: "Zeitplan",
    recommendations: "Empfehlungen",
    nextSteps: "Nächste Schritte",
    riskScore: "Risikobewertung",
    securityScore: "Sicherheitsbewertung",
    critical: "Kritisch",
    high: "Hoch",
    medium: "Mittel",
    low: "Niedrig",
    info: "Info",
    confirmed: "Bestätigt",
    falsePositive: "Falsch Positiv",
    inconclusive: "Nicht Schlüssig",
    pending: "Ausstehend",
  },
  ja: {
    reportTitle: "セキュリティ評価レポート",
    executiveSummary: "エグゼクティブサマリー",
    technicalDetails: "技術的詳細",
    findings: "所見",
    severity: "深刻度",
    status: "ステータス",
    remediation: "修正",
    compliance: "コンプライアンス",
    appendices: "付録",
    glossary: "用語集",
    references: "参考文献",
    generatedAt: "生成日時",
    classification: "分類",
    page: "ページ",
    of_: "/",
    tableOfContents: "目次",
    methodology: "方法論",
    scope: "範囲",
    assets: "アセット",
    evidence: "証拠",
    timeline: "タイムライン",
    recommendations: "推奨事項",
    nextSteps: "次のステップ",
    riskScore: "リスクスコア",
    securityScore: "セキュリティスコア",
    critical: "重大",
    high: "高",
    medium: "中",
    low: "低",
    info: "情報",
    confirmed: "確認済み",
    falsePositive: "誤検出",
    inconclusive: "結論が出ていない",
    pending: "保留中",
  },
  es: {
    reportTitle: "Informe de Evaluación de Seguridad",
    executiveSummary: "Resumen Ejecutivo",
    technicalDetails: "Detalles Técnicos",
    findings: "Hallazgos",
    severity: "Gravedad",
    status: "Estado",
    remediation: "Remediación",
    compliance: "Cumplimiento",
    appendices: "Apéndices",
    glossary: "Glosario",
    references: "Referencias",
    generatedAt: "Generado el",
    classification: "Clasificación",
    page: "Página",
    of_: "de",
    tableOfContents: "Índice de Contenidos",
    methodology: "Metodología",
    scope: "Alcance",
    assets: "Activos",
    evidence: "Evidencia",
    timeline: "Cronología",
    recommendations: "Recomendaciones",
    nextSteps: "Próximos Pasos",
    riskScore: "Puntuación de Riesgo",
    securityScore: "Puntuación de Seguridad",
    critical: "Crítico",
    high: "Alto",
    medium: "Medio",
    low: "Bajo",
    info: "Info",
    confirmed: "Confirmado",
    falsePositive: "Falso Positivo",
    inconclusive: "No Concluyente",
    pending: "Pendiente",
  },
  zh: {
    reportTitle: "安全评估报告",
    executiveSummary: "执行摘要",
    technicalDetails: "技术详情",
    findings: "发现",
    severity: "严重性",
    status: "状态",
    remediation: "修复",
    compliance: "合规性",
    appendices: "附录",
    glossary: "词汇表",
    references: "参考文献",
    generatedAt: "生成于",
    classification: "分类",
    page: "页",
    of_: "/",
    tableOfContents: "目录",
    methodology: "方法论",
    scope: "范围",
    assets: "资产",
    evidence: "证据",
    timeline: "时间线",
    recommendations: "建议",
    nextSteps: "后续步骤",
    riskScore: "风险评分",
    securityScore: "安全评分",
    critical: "严重",
    high: "高",
    medium: "中",
    low: "低",
    info: "信息",
    confirmed: "已确认",
    falsePositive: "误报",
    inconclusive: "未确定",
    pending: "待定",
  },
  ru: {
    reportTitle: "Отчет об оценке безопасности",
    executiveSummary: "Резюме для руководства",
    technicalDetails: "Технические детали",
    findings: "Результаты",
    severity: "Серьезность",
    status: "Статус",
    remediation: "Исправление",
    compliance: "Соответствие",
    appendices: "Приложения",
    glossary: "Глоссарий",
    references: "Ссылки",
    generatedAt: "Создано",
    classification: "Классификация",
    page: "Страница",
    of_: "из",
    tableOfContents: "Содержание",
    methodology: "Методология",
    scope: "Область",
    assets: "Активы",
    evidence: "Доказательства",
    timeline: "Хронология",
    recommendations: "Рекомендации",
    nextSteps: "Следующие шаги",
    riskScore: "Оценка риска",
    securityScore: "Оценка безопасности",
    critical: "Критический",
    high: "Высокий",
    medium: "Средний",
    low: "Низкий",
    info: "Информация",
    confirmed: "Подтверждено",
    falsePositive: "Ложное срабатывание",
    inconclusive: "Неопределенный",
    pending: "В ожидании",
  },
  pt: {
    reportTitle: "Relatório de Avaliação de Segurança",
    executiveSummary: "Resumo Executivo",
    technicalDetails: "Detalhes Técnicos",
    findings: "Descobertas",
    severity: "Severidade",
    status: "Status",
    remediation: "Remediação",
    compliance: "Conformidade",
    appendices: "Apêndices",
    glossary: "Glossário",
    references: "Referências",
    generatedAt: "Gerado em",
    classification: "Classificação",
    page: "Página",
    of_: "de",
    tableOfContents: "Índice",
    methodology: "Metodologia",
    scope: "Escopo",
    assets: "Ativos",
    evidence: "Evidências",
    timeline: "Linha do Tempo",
    recommendations: "Recomendações",
    nextSteps: "Próximos Passos",
    riskScore: "Pontuação de Risco",
    securityScore: "Pontuação de Segurança",
    critical: "Crítico",
    high: "Alto",
    medium: "Médio",
    low: "Baixo",
    info: "Info",
    confirmed: "Confirmado",
    falsePositive: "Falso Positivo",
    inconclusive: "Inconclusivo",
    pending: "Pendente",
  },
};

// ── RTL Languages ──────────────────────────────────────────────────────────

const RTL_LANGUAGES: Set<ReportLanguage> = new Set(["ar", "he"]);

// ── Localization Service ───────────────────────────────────────────────────

export class LocalizationService {
  private defaultLanguage: ReportLanguage = "en";

  setDefaultLanguage(lang: ReportLanguage): void {
    this.defaultLanguage = lang;
  }

  getString(key: keyof LocalizedStrings, language?: ReportLanguage): string {
    const lang = language ?? this.defaultLanguage;
    const strings = STRINGS[lang];
    return strings?.[key] ?? STRINGS["en"]?.[key] ?? key;
  }

  isRtl(language?: ReportLanguage): boolean {
    return RTL_LANGUAGES.has(language ?? this.defaultLanguage);
  }

  formatDate(date: Date | string, language?: ReportLanguage): string {
    const d = typeof date === "string" ? new Date(date) : date;
    const lang = language ?? this.defaultLanguage;

    try {
      return d.toLocaleDateString(this.toLocale(lang), {
        year: "numeric",
        month: "long",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch {
      return d.toISOString();
    }
  }

  formatNumber(num: number, language?: ReportLanguage): string {
    const lang = language ?? this.defaultLanguage;
    try {
      return new Intl.NumberFormat(this.toLocale(lang)).format(num);
    } catch {
      return String(num);
    }
  }

  getComplianceTerm(framework: string, language?: ReportLanguage): string {
    // Map framework names to localized terms
    const terms: Record<string, Partial<Record<ReportLanguage, string>>> = {
      pci_dss: { ar: "PCI DSS", ja: "PCI DSS", zh: "支付卡行业数据安全标准" },
      gdpr: { ar: "اللائحة العامة لحماية البيانات", fr: "RGPD", de: "DSGVO", es: "RGPD", ja: "GDPR", zh: "通用数据保护条例" },
      hipaa: { ar: "HIPAA", ja: "HIPAA", zh: "健康保险可携性和责任法案" },
    };
    return terms[framework]?.[language ?? this.defaultLanguage] ?? framework.toUpperCase();
  }

  getDirection(language?: ReportLanguage): "ltr" | "rtl" {
    return this.isRtl(language) ? "rtl" : "ltr";
  }

  getCssDirection(language?: ReportLanguage): string {
    return this.isRtl(language)
      ? "direction: rtl; text-align: right;"
      : "direction: ltr; text-align: left;";
  }

  private toLocale(lang: ReportLanguage): string {
    const map: Partial<Record<ReportLanguage, string>> = {
      en: "en-US", ar: "ar-SA", zh: "zh-CN", fr: "fr-FR",
      de: "de-DE", ja: "ja-JP", ko: "ko-KR", pt: "pt-BR",
      ru: "ru-RU", es: "es-ES", tr: "tr-TR", nl: "nl-NL",
      it: "it-IT", pl: "pl-PL", sv: "sv-SE", da: "da-DK",
      fi: "fi-FI", nb: "nb-NO", cs: "cs-CZ", hu: "hu-HU",
      ro: "ro-RO", uk: "uk-UA", el: "el-GR", he: "he-IL",
      hi: "hi-IN", th: "th-TH", vi: "vi-VN",
    };
    return map[lang] ?? "en-US";
  }
}

// ── Singleton ──────────────────────────────────────────────────────────────
export const localizationService = new LocalizationService();
