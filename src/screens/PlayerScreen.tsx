import React, { useEffect, useMemo, useState } from 'react';
import { Alert, BackHandler, FlatList, Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import { videoEngine } from '../engine/videoEngine';
import { colors, radius, spacing } from '../theme/colors';
import { ScreenProps, VideoItem } from '../types';
import { useLibrary } from '../state/LibraryContext';
import { SPEEDS, usePlayback } from '../hooks/usePlayback';
import { useFullscreen } from '../hooks/useFullscreen';
import { metaLine } from '../utils/format';
import { sameTrack, trackLabel } from '../utils/subtitles';
import PlayerSurface from '../components/PlayerSurface';
import OptionSheet from '../components/OptionSheet';
import StateView from '../components/StateView';
import VideoCard from '../components/VideoCard';

type Props = ScreenProps<'Player'>;
const VideoView = videoEngine.VideoView;

export default function PlayerScreen({ navigation, route }: Props) {
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const landscape = width > height;
  const { videos: allVideos, setDuration } = useLibrary();
  const queueIds = route.params.queue;
  // The queue is the list the user was looking at (search/sort/folder applied); falls back to the whole library.
  const videos = useMemo<VideoItem[]>(() => {
    if (!queueIds) return allVideos;
    const byId = new Map(allVideos.map((v) => [v.id, v]));
    return queueIds.map((id) => byId.get(id)).filter((v): v is VideoItem => !!v);
  }, [allVideos, queueIds]);
  const { fullscreen, exit: exitFullscreen, toggle: toggleFullscreen } = useFullscreen();

  const [currentId, setCurrentId] = useState(route.params.videoId);
  const [speedOpen, setSpeedOpen] = useState(false);
  const [subsOpen, setSubsOpen] = useState(false);
  const [locked, setLocked] = useState(false);

  const index = videos.findIndex((v) => v.id === currentId);
  const video = index >= 0 ? videos[index] : undefined;
  const canPrev = index > 0;
  const canNext = index >= 0 && index < videos.length - 1;

  const pb = usePlayback(video?.uri ?? null, {
    onEnd: () => { if (canNext) setCurrentId(videos[index + 1].id); },
    onDuration: (sec) => { if (video) setDuration(video.id, sec); },
  });

  useEffect(() => { setSpeedOpen(false); setSubsOpen(false); }, [currentId]);
  useEffect(() => { if (!fullscreen) setLocked(false); }, [fullscreen]);

  // Hardware/gesture back: close a menu first, ignore while locked, leave fullscreen before leaving the screen.
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (locked) return true;
      if (speedOpen || subsOpen) { setSpeedOpen(false); setSubsOpen(false); return true; }
      if (fullscreen) { exitFullscreen(); return true; }
      return false;
    });
    return () => sub.remove();
  }, [locked, speedOpen, subsOpen, fullscreen, exitFullscreen]);

  if (!video) {
    return (
      <View style={[styles.root, { paddingTop: insets.top }]}>
        <StateView kind="error" title="Video not found" message="This video is no longer in your library." actionLabel="Back to library" onAction={() => navigation.goBack()} />
      </View>
    );
  }

  const goPrev = () => {
    if (pb.position > 3 || !canPrev) pb.seekTo(0);
    else setCurrentId(videos[index - 1].id);
  };
  const goNext = () => { if (canNext) setCurrentId(videos[index + 1].id); };
  const notConnected = (what: string) => () => Alert.alert('Not connected yet', `${what} arrives in a later phase.`);

  const speedOptions = SPEEDS.map((r) => ({ key: String(r), label: r === 1 ? 'Normal (1×)' : `${r}×`, selected: r === pb.rate }));
  const subOptions = [
    { key: 'off', label: 'Off', selected: !pb.subtitleTrack },
    ...pb.subtitleTracks.map((t, i) => ({ key: String(i), label: trackLabel(t, i), selected: sameTrack(t, pb.subtitleTrack) })),
  ];
  const hasSubs = pb.subtitleTracks.length > 0;

  const split = landscape && !fullscreen;

  const header = (
    <View>
      <View style={styles.info}>
        <Text style={styles.title}>{video.title}</Text>
        <Text style={styles.meta}>{metaLine(video)}</Text>
      </View>
      <View style={styles.actions}>
        <Pressable onPress={() => setSpeedOpen(true)} style={styles.actionPill} accessibilityRole="button" accessibilityLabel="Playback speed">
          <Ionicons name="speedometer-outline" size={18} color={colors.primary} />
          <Text style={styles.actionText}>Speed{pb.rate !== 1 ? ` ${pb.rate}×` : ''}</Text>
        </Pressable>
        {hasSubs && (
          <Pressable onPress={() => setSubsOpen(true)} style={styles.actionPill} accessibilityRole="button" accessibilityLabel="Subtitles">
            <Ionicons name="chatbox-ellipses-outline" size={18} color={colors.primary} />
            <Text style={styles.actionText}>Subtitles</Text>
          </Pressable>
        )}
        {([['heart-outline', 'Favorite'], ['list-outline', 'Queue'], ['information-circle-outline', 'Details']] as const).map(([icon, label]) => (
          <Pressable key={label} onPress={notConnected(label)} style={styles.actionPill} accessibilityRole="button" accessibilityLabel={`${label} (not connected)`}>
            <Ionicons name={icon} size={18} color={colors.textSecondary} />
            <Text style={[styles.actionText, { color: colors.textSecondary }]}>{label}</Text>
          </Pressable>
        ))}
      </View>
      <Text style={styles.sectionTitle}>Queue · {index + 1} of {videos.length}</Text>
    </View>
  );

  // One stable tree: the video surface is always the first child, so switching between
  // portrait / landscape / fullscreen only changes styles and never remounts the player view.
  const rootStyle = fullscreen
    ? { paddingLeft: insets.left, paddingRight: insets.right }
    : split
      ? { flexDirection: 'row' as const, paddingLeft: insets.left, paddingRight: insets.right }
      : { paddingTop: insets.top };
  const surfaceWrap = fullscreen ? styles.fill : split ? styles.splitVideo : styles.portraitVideo;

  return (
    <View style={[styles.root, rootStyle]}>
      <StatusBar hidden={fullscreen} style="light" />

      <View style={surfaceWrap}>
        <PlayerSurface
          style={styles.fill}
          videoLayer={<VideoView player={pb.player} style={StyleSheet.absoluteFill} contentFit="contain" nativeControls={false} />}
          title={video.title}
          durationSec={pb.duration}
          positionSec={pb.position}
          bufferedSec={pb.buffered}
          isPlaying={pb.isPlaying}
          status={pb.status}
          error={pb.error}
          rateLabel={pb.rate !== 1 ? `${pb.rate}×` : null}
          fullscreen={fullscreen}
          canPrev={canPrev}
          canNext={canNext}
          hasSubtitles={hasSubs}
          subtitlesOn={!!pb.subtitleTrack}
          locked={locked}
          menuOpen={speedOpen || subsOpen}
          onBack={() => (fullscreen ? exitFullscreen() : navigation.goBack())}
          onTogglePlay={pb.togglePlay}
          onSeekBy={pb.seekBy}
          onSeekTo={pb.seekTo}
          onSeekRatio={(r) => pb.seekTo(r * pb.duration)}
          onPrev={goPrev}
          onNext={goNext}
          onToggleFullscreen={toggleFullscreen}
          onSettings={() => setSpeedOpen(true)}
          onSubtitles={() => setSubsOpen(true)}
          onLock={() => setLocked(true)}
          onUnlock={() => setLocked(false)}
          onRetry={pb.retry}
        />
      </View>

      {!fullscreen ? (
        <View style={split ? { flex: 2, paddingTop: insets.top } : styles.fill}>
          <FlatList
            data={videos}
            keyExtractor={(v) => v.id}
            ListHeaderComponent={header}
            contentContainerStyle={{ paddingBottom: insets.bottom + spacing.xl }}
            renderItem={({ item }) => (
              <VideoCard video={item} variant="row" active={item.id === currentId} onPress={() => setCurrentId(item.id)} />
            )}
          />
        </View>
      ) : null}

      {speedOpen ? (
        <OptionSheet
          title="Playback speed"
          options={speedOptions}
          onSelect={(k) => pb.setRate(Number(k))}
          onClose={() => setSpeedOpen(false)}
        />
      ) : null}
      {subsOpen ? (
        <OptionSheet
          title="Subtitles"
          options={subOptions}
          onSelect={(k) => pb.setSubtitleTrack(k === 'off' ? null : pb.subtitleTracks[Number(k)])}
          onClose={() => setSubsOpen(false)}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  fill: { flex: 1 },
  portraitVideo: { width: '100%', aspectRatio: 16 / 9 },
  splitVideo: { flex: 3 },
  info: { padding: spacing.lg, gap: 4 },
  title: { color: colors.text, fontSize: 18, fontWeight: '700', lineHeight: 24 },
  meta: { color: colors.textSecondary, fontSize: 13 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, paddingHorizontal: spacing.lg, paddingBottom: spacing.md },
  actionPill: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: colors.card, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderRadius: radius.pill },
  actionText: { color: colors.text, fontSize: 13, fontWeight: '600' },
  sectionTitle: { color: colors.text, fontSize: 16, fontWeight: '700', paddingHorizontal: spacing.lg, paddingVertical: spacing.sm },
});
