// Mono Icons (MIT, icons.mono.company) 원본 경로. AI 아이콘(✦)만 자체 모양이다.
import type { SVGProps } from "react";

type IconProps = SVGProps<SVGSVGElement> & { size?: number };

function make(paths: string[], name: string) {
  const Icon = ({ size = 16, ...rest }: IconProps) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" {...rest}>
      {paths.map((d, i) => (
        <path key={i} d={d} />
      ))}
    </svg>
  );
  Icon.displayName = name;
  return Icon;
}

export const PlusIcon = make(["M12 4a1 1 0 0 1 1 1v6h6a1 1 0 1 1 0 2h-6v6a1 1 0 1 1-2 0v-6H5a1 1 0 1 1 0-2h6V5a1 1 0 0 1 1-1z"], "PlusIcon");
export const SettingsIcon = make(
  [
    "M12 4a1 1 0 0 0-1 1c0 1.692-2.046 2.54-3.243 1.343a1 1 0 1 0-1.414 1.414C7.54 8.954 6.693 11 5 11a1 1 0 1 0 0 2c1.692 0 2.54 2.046 1.343 3.243a1 1 0 0 0 1.414 1.414C8.954 16.46 11 17.307 11 19a1 1 0 1 0 2 0c0-1.692 2.046-2.54 3.243-1.343a1 1 0 1 0 1.414-1.414C16.46 15.046 17.307 13 19 13a1 1 0 1 0 0-2c-1.692 0-2.54-2.046-1.343-3.243a1 1 0 0 0-1.414-1.414C15.046 7.54 13 6.693 13 5a1 1 0 0 0-1-1zm-2.992.777a3 3 0 0 1 5.984 0 3 3 0 0 1 4.23 4.231 3 3 0 0 1 .001 5.984 3 3 0 0 1-4.231 4.23 3 3 0 0 1-5.984 0 3 3 0 0 1-4.231-4.23 3 3 0 0 1 0-5.984 3 3 0 0 1 4.231-4.231z",
    "M12 10a2 2 0 1 0 0 4 2 2 0 0 0 0-4zm-2.828-.828a4 4 0 1 1 5.656 5.656 4 4 0 0 1-5.656-5.656z",
  ],
  "SettingsIcon",
);
export const ChevronRightIcon = make(["M9.293 18.707a1 1 0 0 1 0-1.414L14.586 12 9.293 6.707a1 1 0 0 1 1.414-1.414l6 6a1 1 0 0 1 0 1.414l-6 6a1 1 0 0 1-1.414 0z"], "ChevronRightIcon");
export const CheckIcon = make(["M20.664 5.253a1 1 0 0 1 .083 1.411l-10.666 12a1 1 0 0 1-1.495 0l-5.333-6a1 1 0 0 1 1.494-1.328l4.586 5.159 9.92-11.16a1 1 0 0 1 1.411-.082z"], "CheckIcon");
export const PlayIcon = make(["M6 6.741c0-1.544 1.674-2.505 3.008-1.728l9.015 5.26c1.323.771 1.323 2.683 0 3.455l-9.015 5.258C7.674 19.764 6 18.803 6 17.26V6.741zM17.015 12L8 6.741V17.26L17.015 12z"], "PlayIcon");
export const SunIcon = make(
  ["M12 2a1 1 0 0 1 1 1v1a1 1 0 1 1-2 0V3a1 1 0 0 1 1-1zm7.071 2.929a1 1 0 0 1 0 1.414l-.707.707a1 1 0 1 1-1.414-1.414l.707-.707a1 1 0 0 1 1.414 0zm-14.142 0a1 1 0 0 1 1.414 0l.707.707A1 1 0 0 1 5.636 7.05l-.707-.707a1 1 0 0 1 0-1.414zM12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8zm-6 4a6 6 0 1 1 12 0 6 6 0 0 1-12 0zm-4 0a1 1 0 0 1 1-1h1a1 1 0 1 1 0 2H3a1 1 0 0 1-1-1zm17 0a1 1 0 0 1 1-1h1a1 1 0 1 1 0 2h-1a1 1 0 0 1-1-1zM5.636 16.95a1 1 0 0 1 1.414 1.414l-.707.707a1 1 0 0 1-1.414-1.414l.707-.707zm11.314 1.414a1 1 0 0 1 1.414-1.414l.707.707a1 1 0 0 1-1.414 1.414l-.707-.707zM12 19a1 1 0 0 1 1 1v1a1 1 0 1 1-2 0v-1a1 1 0 0 1 1-1z"],
  "SunIcon",
);
export const AiSparkle = make(
  [
    "M10 4.5C10.65 9.1 13.9 12.35 18.5 13C13.9 13.65 10.65 16.9 10 21.5C9.35 16.9 6.1 13.65 1.5 13C6.1 12.35 9.35 9.1 10 4.5Z",
    "M18.5 1.5C18.8 3.6 20.15 4.95 22.25 5.25C20.15 5.55 18.8 6.9 18.5 9C18.2 6.9 16.85 5.55 14.75 5.25C16.85 4.95 18.2 3.6 18.5 1.5Z",
  ],
  "AiSparkle",
);

export function BrandMark({ size = 24 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 28 28" aria-hidden="true">
      <defs>
        <linearGradient id="brand-mark" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#4ccb92" />
          <stop offset="1" stopColor="#22a56a" />
        </linearGradient>
      </defs>
      <rect width="28" height="28" rx="9" fill="url(#brand-mark)" />
      <path d="M8.5 14.5l3.8 3.8L20 10.2" stroke="#fff" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round" fill="none" />
    </svg>
  );
}
