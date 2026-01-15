interface ScanLineProps {
	visible: boolean;
}

/**
 * Animated scanning line indicator
 */
const ScanLine = ({ visible }: ScanLineProps) => {
	if (!visible) return null;

	return (
		<div className="mbs-scan-line-container">
			<div className="mbs-scan-line-trail-down" />
			<div className="mbs-scan-line" />
			<div className="mbs-scan-line-trail-up" />
		</div>
	);
};

export default ScanLine;
