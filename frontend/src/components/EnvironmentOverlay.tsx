import { DEPLOYMENT } from "../store/servicesApi.ts";

export function EnvironmentOverlay() {
  if (import.meta.env.VITE_DISABLE_ENV_OVERLAY === "1") return null;
  if (DEPLOYMENT !== "uat") return null;

  return (
    <div
      data-testid="environment-overlay"
      aria-hidden="true"
      className="fixed inset-0 z-[100] pointer-events-none select-none overflow-hidden"
    >
      <svg
        width="100%"
        height="100%"
        xmlns="http://www.w3.org/2000/svg"
        role="presentation"
        className="opacity-[0.06]"
      >
        <defs>
          <pattern
            id="env-watermark"
            patternUnits="userSpaceOnUse"
            width="420"
            height="80"
            patternTransform="rotate(-30)"
          >
            <text
              x="0"
              y="50"
              fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace"
              fontWeight="700"
              fontSize="38"
              letterSpacing="6"
              fill="rgb(251 191 36)"
            >
              UAT — NOT PRODUCTION
            </text>
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#env-watermark)" />
      </svg>
    </div>
  );
}
