/**
 * Camera configuration constants
 * Device-specific camera settings for optimal scanning
 */

/**
 * Camera facing modes
 */
export const FACING_MODE = {
  ENVIRONMENT: "environment",
  USER: "user",
} as const;

export type FacingMode = (typeof FACING_MODE)[keyof typeof FACING_MODE];

/**
 * Camera resolution settings for mobile devices
 */
export const MOBILE_CAMERA_SETTINGS: MediaTrackConstraints = {
  height: { ideal: 1080 },
  width: { ideal: 1920 },
};

/**
 * Camera resolution settings for desktop devices
 */
export const DESKTOP_CAMERA_SETTINGS: MediaTrackConstraints = {
  height: { ideal: 720 },
  width: { ideal: 1280 },
};

/**
 * Camera constraint defaults
 */
export const CAMERA_DEFAULTS: MediaTrackConstraints = {
  frameRate: { ideal: 15, max: 30 },
};
