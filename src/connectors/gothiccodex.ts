export {};

/**
 * Gothic Codex has no player of its own. Everything plays through
 * third-party embeds, so the track info comes from the page around them:
 *
 * - The mini player holds a YouTube video (music videos page) or an Apple
 *   Music song (track lists). Only the YouTube one reports its state, as the
 *   page loads it through the IFrame Player API, which posts messages to the
 *   page.
 * - Artist pages open YouTube videos in a modal, without the Player API.
 *
 * Where the embed reports nothing, playback is detected by the tab audio.
 */
const miniPlayerSelector = '#gc-mini-player';
const videoModalSelector = '#videoModal[open]';

const YT_ORIGIN = 'https://www.youtube.com';
const YT_STATE_PLAYING = 1;

interface YoutubeInfo {
	playerState?: number;
	currentTime?: number;
	duration?: number;
	videoData?: { video_id?: string };
}

/**
 * The mini player keeps its iframe when it skips to the next video, and
 * replaces it when it is reopened, so the info is kept per iframe.
 */
const youtubeInfoByFrame = new WeakMap<Element, YoutubeInfo>();

Connector.useTabAudibleApi();

const isTabAudible = Connector.isPlaying;

Connector.getTrack = () => {
	return Util.getTextFromSelectors(
		isVideoModalOpen()
			? '#videoModalTitle'
			: `${miniPlayerSelector} .gc-mp-title`,
	);
};

Connector.getArtist = () => {
	return Util.getTextFromSelectors(
		isVideoModalOpen()
			? '#artistName'
			: `${miniPlayerSelector} .gc-mp-meta`,
	);
};

Connector.isPlaying = () => {
	const playerState = getYoutubeInfo()?.playerState;

	return playerState === undefined
		? isTabAudible()
		: playerState === YT_STATE_PLAYING;
};

Connector.getCurrentTime = () => getYoutubeInfo()?.currentTime;

Connector.getDuration = () => getYoutubeInfo()?.duration;

Connector.getUniqueID = () => {
	if (isVideoModalOpen()) {
		return Util.getYtVideoIdFromUrl(
			Util.getAttrFromSelectors('#videoModalFrame', 'src'),
		);
	}

	// The iframe URL keeps the first video ID after skipping to the next one.
	return getYoutubeInfo()?.videoData?.video_id;
};

window.addEventListener('message', (event: MessageEvent<unknown>) => {
	const frame = getMiniPlayerYoutubeFrame();
	if (
		!frame ||
		event.source !== frame.contentWindow ||
		event.origin !== YT_ORIGIN
	) {
		return;
	}

	const info = parseYoutubeInfo(event.data);
	if (!info) {
		return;
	}

	// Messages contain only the changed properties.
	youtubeInfoByFrame.set(frame, {
		...youtubeInfoByFrame.get(frame),
		...info,
	});
	Connector.onStateChanged();
});

function isVideoModalOpen() {
	return document.querySelector(videoModalSelector) !== null;
}

function getMiniPlayerYoutubeFrame() {
	return document.querySelector<HTMLIFrameElement>(
		`${miniPlayerSelector}:not(.is-apple) iframe`,
	);
}

function getYoutubeInfo() {
	const frame = isVideoModalOpen() ? null : getMiniPlayerYoutubeFrame();

	return frame ? youtubeInfoByFrame.get(frame) : undefined;
}

function parseYoutubeInfo(data: unknown) {
	if (typeof data !== 'string') {
		return null;
	}

	try {
		const message = JSON.parse(data) as {
			event?: string;
			info?: YoutubeInfo;
		} | null;
		const isInfoMessage =
			message?.event === 'initialDelivery' ||
			message?.event === 'infoDelivery';

		return isInfoMessage ? (message.info ?? null) : null;
	} catch {
		return null;
	}
}
