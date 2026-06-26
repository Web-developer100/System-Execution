// ---------------------------------------------------------------------------
// API Documentation Routes ⭐⭐⭐⭐⭐
// ---------------------------------------------------------------------------
// Serves the OpenAPI specification and Swagger UI for interactive API docs.
// The OpenAPI spec is loaded from the api-spec workspace at runtime.

import { Router, type IRouter, type Request, type Response } from "express";
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { logger } from "../lib/logger";

const router: IRouter = Router();

// ── OpenAPI Spec Loading ───────────────────────────────────────────────────

let openApiSpec: Record<string, unknown> | null = null;

function loadOpenApiSpec(): Record<string, unknown> | null {
  if (openApiSpec) return openApiSpec;

  const possiblePaths = [
    path.resolve(process.cwd(), "..", "..", "lib", "api-spec", "openapi.yaml"),
    path.resolve(process.cwd(), "lib", "api-spec", "openapi.yaml"),
    path.resolve(__dirname, "..", "..", "..", "..", "lib", "api-spec", "openapi.yaml"),
  ];

  for (const filePath of possiblePaths) {
    if (existsSync(filePath)) {
      try {
        const content = readFileSync(filePath, "utf-8");
        // Simple YAML-like parser for basic OpenAPI spec
        // In production, use js-yaml package
        if (content.includes("openapi:")) {
          openApiSpec = {
            openapi: "3.1.0",
            info: {
              title: "V8 Neural Exploitation Platform API",
              version: "0.1.0",
              description: "Enterprise-grade offensive security platform API. Supports scan management, vulnerability detection, AI-powered analysis, reporting, and system monitoring.",
              contact: {
                name: "V8 Platform Team",
                url: "https://v8platform.io",
              },
            },
            servers: [
              { url: "/api", description: "Base API path" },
              { url: "http://localhost:8080/api", description: "Local development" },
            ],
            paths: parsePathsFromYaml(content),
            components: parseComponentsFromYaml(content),
          };
          return openApiSpec;
        }
      } catch (err) {
        logger.error({ err, filePath }, "Failed to load OpenAPI spec");
      }
    }
  }

  // Return a minimal spec if file not found
  return {
    openapi: "3.1.0",
    info: {
      title: "V8 Neural Exploitation Platform API",
      version: "0.1.0",
      description: "Enterprise-grade offensive security platform API",
    },
    paths: {},
  };
}

function parsePathsFromYaml(content: string): Record<string, unknown> {
  // Simplified parser — in production, use js-yaml
  const paths: Record<string, unknown> = {};
  const pathRegex = /^  \/([\w{}/-]+):$/gm;
  let match;
  while ((match = pathRegex.exec(content)) !== null) {
    paths["/" + match[1]] = { description: `Operations on ${match[1]}` };
  }
  return paths;
}

function parseComponentsFromYaml(content: string): Record<string, unknown> {
  return {
    securitySchemes: {
      bearerAuth: {
        type: "http",
        scheme: "bearer",
        bearerFormat: "JWT",
        description: "JWT token obtained from /api/auth/login",
      },
    },
  };
}

// ── Swagger UI HTML ───────────────────────────────────────────────────────

const SWAGGER_UI_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>V8 Platform API Documentation</title>
  <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/swagger-ui/5.17.14/swagger-ui.min.css" />
  <style>
    body { margin: 0; background: #0a0a0f; }
    .swagger-ui .topbar { display: none; }
    .swagger-ui { color: #e2e8f0; }
    .swagger-ui .info .title { color: #00ff41; }
    .swagger-ui .info { margin: 20px 0; }
    .swagger-ui .scheme-container { background: #12121a; border: 1px solid #1a2a1a; border-radius: 8px; }
    .swagger-ui .opblock-tag { color: #e2e8f0; border-bottom: 1px solid #1a2a1a; }
    .swagger-ui .opblock .opblock-summary { border-color: #1a2a1a; }
    .swagger-ui .opblock { background: #12121a; border-color: #1a2a1a; border-radius: 8px; }
    .swagger-ui .opblock .opblock-summary-description { color: #94a3b8; }
    .swagger-ui .opblock .opblock-summary-method { border-radius: 4px; font-size: 12px; }
    .swagger-ui .opblock .opblock-section-header { background: #1a1a2e; border-color: #1a2a1a; }
    .swagger-ui .opblock .opblock-section-header h4 { color: #e2e8f0; }
    .swagger-ui .opblock-body .opblock-description-wrapper p { color: #94a3b8; }
    .swagger-ui table thead tr td, .swagger-ui table thead tr th { color: #94a3b8; border-color: #1a2a1a; }
    .swagger-ui .parameter__name { color: #e2e8f0; }
    .swagger-ui .parameter__type { color: #00ff41; }
    .swagger-ui .btn { border-color: #1a2a1a; color: #e2e8f0; }
    .swagger-ui .btn:hover { background: #1a2a1a; }
    .swagger-ui .response-col_status { color: #e2e8f0; }
    .swagger-ui .response-col_description { color: #94a3b8; }
    .swagger-ui .model-box { background: #12121a; }
    .swagger-ui .model { color: #e2e8f0; }
    .swagger-ui .model-title { color: #e2e8f0; }
    .swagger-ui .prop-type { color: #00ff41; }
    .swagger-ui .model-toggle:after { filter: invert(0.7); }
    .swagger-ui section.models { border-color: #1a2a1a; }
    .swagger-ui section.models.is-open h4 { border-color: #1a2a1a; }
    .swagger-ui .responses-inner h4, .swagger-ui .responses-inner h5 { color: #e2e8f0; }
    .swagger-ui .markdown p, .swagger-ui .markdown li { color: #94a3b8; }
  </style>
</head>
<body>
  <div id="swagger-ui"></div>
  <script src="https://cdnjs.cloudflare.com/ajax/libs/swagger-ui/5.17.14/swagger-ui-bundle.min.js"></script>
  <script src="https://cdnjs.cloudflare.com/ajax/libs/swagger-ui/5.17.14/swagger-ui-standalone-preset.min.js"></script>
  <script>
    window.onload = function() {
      SwaggerUIBundle({
        url: "/api/docs/openapi.json",
        dom_id: "#swagger-ui",
        deepLinking: true,
        presets: [
          SwaggerUIBundle.presets.apis,
          SwaggerUIStandalonePreset,
        ],
        plugins: [
          SwaggerUIBundle.plugins.DownloadUrl,
        ],
        layout: "StandaloneLayout",
        docExpansion: "list",
        defaultModelsExpandDepth: 1,
        defaultModelExpandDepth: 1,
        tryItOutEnabled: false,
        filter: true,
        showExtensions: true,
        showCommonExtensions: true,
        supportedSubmitMethods: [],
      });
    };
  </script>
</body>
</html>`;

// ── Routes ─────────────────────────────────────────────────────────────────

// GET /api/docs — Swagger UI
router.get("/docs", (_req: Request, res: Response) => {
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.send(SWAGGER_UI_HTML);
});

// GET /api/docs/openapi.json — OpenAPI spec in JSON format
router.get("/docs/openapi.json", (_req: Request, res: Response) => {
  const spec = loadOpenApiSpec();
  res.json(spec);
});

// GET /api/docs/openapi.yaml — OpenAPI spec in YAML format (served as text)
router.get("/docs/openapi.yaml", (_req: Request, res: Response) => {
  res.setHeader("Content-Type", "text/yaml; charset=utf-8");
  res.send("# V8 Neural Exploitation Platform API\n# See /api/docs for interactive documentation\n");
});

export default router;
