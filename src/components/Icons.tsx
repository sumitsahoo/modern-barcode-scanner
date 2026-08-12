import type { SVGProps } from "react";

const sharedIconProps = {
  xmlns: "http://www.w3.org/2000/svg",
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.8,
  strokeLinecap: "round",
  strokeLinejoin: "round",
  "aria-hidden": true,
  focusable: false,
} as const;

const CameraShape = () => (
  <>
    <path d="M4 9.25A2.75 2.75 0 0 1 6.75 6.5h1.16a1.5 1.5 0 0 0 1.34-.83l.2-.4a1.5 1.5 0 0 1 1.34-.82h2.42a1.5 1.5 0 0 1 1.34.82l.2.4a1.5 1.5 0 0 0 1.34.83h1.16A2.75 2.75 0 0 1 20 9.25v7.5a2.75 2.75 0 0 1-2.75 2.75H6.75A2.75 2.75 0 0 1 4 16.75v-7.5Z" />
    <circle cx="12" cy="13" r="3.15" />
  </>
);

const TorchShape = () => (
  <>
    <path d="M8.5 3.5h7l-.75 5h-5.5l-.75-5Z" />
    <path d="M9.25 8.5h5.5l-.7 11.75h-4.1L9.25 8.5Z" />
    <path d="M10.3 11.75h3.4" />
  </>
);

export const IconCamera = (props: SVGProps<SVGSVGElement>) => (
  <svg {...sharedIconProps} {...props}>
    <CameraShape />
  </svg>
);

export const IconCameraOff = (props: SVGProps<SVGSVGElement>) => (
  <svg {...sharedIconProps} {...props}>
    <CameraShape />
    <path d="m3 3 18 18" strokeWidth={2} />
  </svg>
);

export const IconRotateCamera = (props: SVGProps<SVGSVGElement>) => (
  <svg {...sharedIconProps} {...props}>
    <path d="M7.25 7.25a7 7 0 0 1 10.88.55" />
    <path d="M18.15 4.75v3.1h-3.1" />
    <path d="M16.75 16.75a7 7 0 0 1-10.88-.55" />
    <path d="M5.85 19.25v-3.1h3.1" />
    <circle cx="12" cy="12" r="2.35" />
  </svg>
);

export const IconTorchOn = (props: SVGProps<SVGSVGElement>) => (
  <svg {...sharedIconProps} {...props}>
    <TorchShape />
    <path d="M6.25 5.25 4.75 3.75M17.75 5.25l1.5-1.5M12 1.75V.5" />
  </svg>
);

export const IconTorchOff = (props: SVGProps<SVGSVGElement>) => (
  <svg {...sharedIconProps} {...props}>
    <TorchShape />
    <path d="m3 3 18 18" strokeWidth={2} />
  </svg>
);

export const IconCheck = (props: SVGProps<SVGSVGElement>) => (
  <svg {...sharedIconProps} {...props}>
    <path d="m5 12.5 4.25 4.25L19 7" strokeWidth={2} />
  </svg>
);

export const IconScanFrame = (props: SVGProps<SVGSVGElement>) => (
  <svg {...sharedIconProps} {...props}>
    <path d="M9 5.5H6.5a1 1 0 0 0-1 1V9M15 5.5h2.5a1 1 0 0 1 1 1V9M9 18.5H6.5a1 1 0 0 1-1-1V15M15 18.5h2.5a1 1 0 0 0 1-1V15M8.5 12h7" />
  </svg>
);

export const IconAdjustments = (props: SVGProps<SVGSVGElement>) => (
  <svg {...sharedIconProps} {...props}>
    <path d="M4 6h10M18 6h2M4 12h2M10 12h10M4 18h7M15 18h5" />
    <circle cx="16" cy="6" r="2" />
    <circle cx="8" cy="12" r="2" />
    <circle cx="13" cy="18" r="2" />
  </svg>
);

export const IconCameraPlaceholder = IconCameraOff;
