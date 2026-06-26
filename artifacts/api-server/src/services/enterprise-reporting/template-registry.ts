// ---------------------------------------------------------------------------
// Template Registry Service ⭐⭐⭐⭐⭐
// ---------------------------------------------------------------------------
// Manages report templates, themes, branding, and custom template editing.

import { logger } from "../../lib/logger";
import type {
  TemplateDefinition, TemplateStyle, ReportCategory,
  ReportBranding, ReportFormat, ReportLanguage,
} from "./types";
import { TEMPLATE_DEFINITIONS, DEFAULT_BRANDING } from "./types";

// ── Template Registry ──────────────────────────────────────────────────────

export class TemplateRegistry {
  private templates: Map<string, TemplateDefinition> = new Map();
  private customBranding: Map<string, Partial<ReportBranding>> = new Map();
  private customCss: Map<string, string> = new Map();

  constructor() {
    // Load built-in templates
    for (const tpl of TEMPLATE_DEFINITIONS) {
      this.templates.set(tpl.id, tpl);
    }
    logger.info({ count: this.templates.size }, "[TEMPLATE-REGISTRY] Loaded built-in templates");
  }

  // ── Get Template ────────────────────────────────────────────────────────

  getTemplate(id: string): TemplateDefinition | undefined {
    return this.templates.get(id);
  }

  // ── Get Templates for Category ──────────────────────────────────────────

  getTemplatesForCategory(category: ReportCategory): TemplateDefinition[] {
    return Array.from(this.templates.values()).filter(t =>
      t.categories.includes(category) || t.categories.includes("executive"),
    );
  }

  // ── List All Templates ──────────────────────────────────────────────────

  listTemplates(): TemplateDefinition[] {
    return Array.from(this.templates.values());
  }

  // ── Register Custom Template ────────────────────────────────────────────

  registerCustomTemplate(template: TemplateDefinition): void {
    this.templates.set(template.id, template);
    logger.info({ templateId: template.id, name: template.name }, "[TEMPLATE-REGISTRY] Registered custom template");
  }

  // ── Remove Template ─────────────────────────────────────────────────────

  removeTemplate(id: string): boolean {
    const removed = this.templates.delete(id);
    if (removed) {
      this.customBranding.delete(id);
      this.customCss.delete(id);
    }
    return removed;
  }

  // ── Get Branding ────────────────────────────────────────────────────────

  getBranding(templateId: string): ReportBranding {
    const tpl = this.templates.get(templateId);
    const custom = this.customBranding.get(templateId);
    const base = tpl?.branding ?? {};
    return { ...DEFAULT_BRANDING, ...base, ...custom };
  }

  // ── Set Custom Branding ─────────────────────────────────────────────────

  setCustomBranding(templateId: string, branding: Partial<ReportBranding>): void {
    this.customBranding.set(templateId, branding);
    logger.info({ templateId }, "[TEMPLATE-REGISTRY] Custom branding updated");
  }

  // ── Get Custom CSS ──────────────────────────────────────────────────────

  getCustomCss(templateId: string): string | undefined {
    return this.customCss.get(templateId);
  }

  // ── Set Custom CSS ─────────────────────────────────────────────────────

  setCustomCss(templateId: string, css: string): void {
    this.customCss.set(templateId, css);
    logger.info({ templateId }, "[TEMPLATE-REGISTRY] Custom CSS updated");
  }

  // ── Generate Template CSS ───────────────────────────────────────────────

  generateTemplateCss(templateId: string): string {
    const tpl = this.templates.get(templateId);
    const branding = this.getBranding(templateId);
    const customCss = this.customCss.get(templateId) ?? "";

    const baseCss = `
      :root {
        --primary: ${branding.primaryColor};
        --secondary: ${branding.secondaryColor};
        --font-family: ${branding.fontFamily};
        --bg: ${tpl?.darkMode ? "#020617" : "#ffffff"};
        --text: ${tpl?.darkMode ? "#e2e8f0" : "#1e293b"};
        --text-muted: ${tpl?.darkMode ? "#64748b" : "#64748b"};
        --card-bg: ${tpl?.darkMode ? "#0f172a" : "#f8fafc"};
        --border: ${tpl?.darkMode ? "#1e293b" : "#e2e8f0"};
      }
    `;

    return `${baseCss}\n${customCss}`;
  }

  // ── Get Template Description ────────────────────────────────────────────

  getTemplateDescription(templateId: string): string | null {
    return this.templates.get(templateId)?.description ?? null;
  }
}

// ── Singleton ──────────────────────────────────────────────────────────────
export const templateRegistry = new TemplateRegistry();
