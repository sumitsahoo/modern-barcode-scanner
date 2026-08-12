/* Hallmark · component: scanner icon system · genre: modern-minimal · theme: Cobalt · grid: 24px · stroke: 1.75px */
/* Hallmark · pre-emit critique: P5 H5 E5 S5 R5 V5 */
import type { ReactNode, SVGProps } from "react";

type IconProps = SVGProps<SVGSVGElement>;

interface IconBaseProps extends IconProps {
  children: ReactNode;
}

const IconBase = ({ children, ...props }: IconBaseProps) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={1.75}
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
    focusable="false"
    {...props}
  >
    {children}
  </svg>
);

const CameraShape = () => (
  <>
    <path d="M4 10a2.5 2.5 0 0 1 2.5-2.5h1.25l1.5-2h5.5l1.5 2h1.25A2.5 2.5 0 0 1 20 10v6.5a2.5 2.5 0 0 1-2.5 2.5h-11A2.5 2.5 0 0 1 4 16.5V10Z" />
    <circle cx="12" cy="13" r="3" />
  </>
);

const TorchShape = () => (
  <>
    <path d="M8.25 3.75h7.5l-.9 4.5h-5.7l-.9-4.5Z" />
    <path d="M9.5 8.25h5l-.65 12h-3.7l-.65-12Z" />
    <path d="M10.25 12h3.5" />
  </>
);

export const IconCamera = (props: IconProps) => (
  <IconBase {...props}>
    <CameraShape />
  </IconBase>
);

export const IconCameraOff = (props: IconProps) => (
  <IconBase {...props}>
    <CameraShape />
    <path d="M3.5 3.5 20.5 20.5" />
  </IconBase>
);

export const IconRotateCamera = (props: IconProps) => (
  <IconBase {...props}>
    <path d="M6.75 7.25a7.5 7.5 0 0 1 11.5.5" />
    <path d="M18.25 4.75v3h-3" />
    <path d="M17.25 16.75a7.5 7.5 0 0 1-11.5-.5" />
    <path d="M5.75 19.25v-3h3" />
    <path d="M8.25 11.25a1 1 0 0 1 1-1h1l.75-1h2l.75 1h1a1 1 0 0 1 1 1v3.5a1 1 0 0 1-1 1h-5.5a1 1 0 0 1-1-1v-3.5Z" />
    <circle cx="12" cy="13" r="1.25" />
  </IconBase>
);

export const IconTorchOn = (props: IconProps) => (
  <IconBase {...props}>
    <TorchShape />
    <path d="M6.5 4 5 2.5M17.5 4 19 2.5M12 1.75V.5" />
  </IconBase>
);

export const IconTorchOff = (props: IconProps) => (
  <IconBase {...props}>
    <TorchShape />
    <path d="M3.5 3.5 20.5 20.5" />
  </IconBase>
);

export const IconCheck = (props: IconProps) => (
  <IconBase {...props}>
    <path d="m5.25 12.5 4.25 4.25L18.75 7" />
  </IconBase>
);

export const IconAlert = (props: IconProps) => (
  <IconBase {...props}>
    <circle cx="12" cy="12" r="8" />
    <path d="M12 8.25v5.25M12 16.75h.01" />
  </IconBase>
);

export const IconScanFrame = (props: IconProps) => (
  <IconBase {...props}>
    <path d="M9 4.5H6.5a2 2 0 0 0-2 2V9M15 4.5h2.5a2 2 0 0 1 2 2V9M9 19.5H6.5a2 2 0 0 1-2-2V15M15 19.5h2.5a2 2 0 0 0 2-2V15" />
    <path d="M9 9v6M12 9v6M15 9v6" />
  </IconBase>
);

export const IconAdjustments = (props: IconProps) => (
  <IconBase {...props}>
    <path d="M4 6h4M12 6h8M4 12h9M17 12h3M4 18h2M10 18h10" />
    <rect x="8" y="4.5" width="4" height="3" rx="0.75" />
    <rect x="13" y="10.5" width="4" height="3" rx="0.75" />
    <rect x="6" y="16.5" width="4" height="3" rx="0.75" />
  </IconBase>
);

export const IconCameraPlaceholder = (props: IconProps) => (
  <IconBase {...props}>
    <path d="M8 4.5H6.5a2 2 0 0 0-2 2V8M16 4.5h1.5a2 2 0 0 1 2 2V8M8 19.5H6.5a2 2 0 0 1-2-2V16M16 19.5h1.5a2 2 0 0 0 2-2V16" />
    <circle cx="12" cy="12" r="3.25" />
    <path d="M12 10.5v3M10.5 12h3" />
  </IconBase>
);
