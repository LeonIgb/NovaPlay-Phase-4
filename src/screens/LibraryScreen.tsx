import React, { useMemo, useState } from 'react';
import { Alert, FlatList, Linking, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, radius, spacing, APP_NAME } from '../theme/colors';
import { ScreenProps, VideoItem } from '../types';
import { useLibrary } from '../state/LibraryContext';
import { formatSize } from '../utils/format';
import { DEFAULT_SORT, SORT_KEYS, SORT_LABEL, SortKey, filterVideos, folderOptions, sortLabel, sortVideos, toggleSort } from '../utils/library';
import { videoEngine } from '../engine/videoEngine';
import IconButton from '../components/IconButton';
import StateView from '../components/StateView';
import VideoCard from '../components/VideoCard';
import SearchBar from '../components/SearchBar';
import AccessBanner from '../components/AccessBanner';
import OptionSheet from '../components/OptionSheet';

type Props = ScreenProps<'Library'>;

export default function LibraryScreen({ navigation }: Props) {
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const columns = width > height ? 2 : 1;
  const lib = useLibrary();

  const [query, setQuery] = useState('');
  const [sort, setSort] = useState(DEFAULT_SORT);
  const [folder, setFolder] = useState('all');
  const [sheet, setSheet] = useState<null | 'sort' | 'folder'>(null);
  const [importing, setImporting] = useState(false);

  const folders = useMemo(() => folderOptions(lib.videos), [lib.videos]);
  const activeFolder = folders.some((f) => f.key === folder) ? folder : 'all';
  const activeFolderLabel = folders.find((f) => f.key === activeFolder)?.label ?? 'All videos';
  const visible = useMemo(() => sortVideos(filterVideos(lib.videos, query, activeFolder), sort), [lib.videos, query, activeFolder, sort]);
  const totalMb = visible.reduce((a, v) => a + (v.sizeMb ?? 0), 0);

  const addVideos = async () => {
    try {
      setImporting(true);
      const r = await lib.importFromPicker();
      if (r.cancelled) return;
      if (r.added === 0 && r.skipped > 0) Alert.alert('Already added', 'Those videos are already in your library.');
      else if (r.failed > 0) Alert.alert('Some files were skipped', `${r.failed} file(s) could not be imported.`);
    } catch (e: any) {
      Alert.alert("Couldn't import videos", e?.message ?? 'Something went wrong while reading the selected files.');
    } finally {
      setImporting(false);
    }
  };

  const open = (v: VideoItem) => {
    if (v.missing) {
      Alert.alert('File not found', 'This video is missing or can no longer be accessed.', [
        { text: 'Remove from library', style: 'destructive', onPress: () => lib.removeImported(v.id) },
        { text: 'Cancel', style: 'cancel' },
      ]);
      return;
    }
    navigation.navigate('Player', { videoId: v.id, queue: visible.map((x) => x.id) });
  };

  const confirmRemove = (v: VideoItem) => {
    if (v.source !== 'imported') return; // device videos belong to the user's media store; the app never deletes them
    Alert.alert('Remove video?', `"${v.title}" will be removed from NovaPlay and its imported copy deleted.`, [
      { text: 'Remove', style: 'destructive', onPress: () => lib.removeImported(v.id) },
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

  const clearFilters = () => { setQuery(''); setFolder('all'); };
  const filtered = query.trim().length > 0 || activeFolder !== 'all';

  let body: React.ReactNode;
  if (importing || !lib.hydrated || (lib.scanning && lib.videos.length === 0)) {
    body = <StateView kind="loading" message={importing ? 'Importing videos…' : lib.hydrated ? 'Scanning your device…' : 'Loading your library…'} />;
  } else if (lib.videos.length === 0) {
    body = (
      <StateView
        kind="empty"
        title="No videos yet"
        message={lib.access === 'granted'
          ? 'No videos were found in the folders Android shares with this app. Add videos with the file picker.'
          : 'Allow access to scan this device, or add videos with the file picker.'}
        actionLabel="Add videos"
        onAction={addVideos}
      />
    );
  } else if (visible.length === 0) {
    body = <StateView kind="empty" title="No matches" message={query.trim() ? `Nothing matches “${query.trim()}”.` : 'No videos in this folder.'} actionLabel="Clear filters" onAction={clearFilters} />;
  } else {
    body = (
      <FlatList
        key={columns}
        data={visible}
        numColumns={columns}
        keyExtractor={(v) => v.id}
        keyboardShouldPersistTaps="handled"
        columnWrapperStyle={columns > 1 ? { gap: spacing.lg } : undefined}
        contentContainerStyle={{ padding: spacing.lg, paddingBottom: insets.bottom + spacing.xl }}
        ListHeaderComponent={
          <Text style={styles.summary}>
            {filtered ? `${visible.length} of ${lib.videos.length}` : visible.length} {visible.length === 1 ? 'video' : 'videos'}
            {totalMb > 0 ? ` · ${formatSize(totalMb)}` : ''}
            {lib.scanning ? ' · scanning…' : ''}
          </Text>
        }
        renderItem={({ item }) => (
          <View style={{ flex: 1 }}>
            <VideoCard video={item} onPress={() => open(item)} onLongPress={() => confirmRemove(item)} />
          </View>
        )}
      />
    );
  }

  return (
    <View style={[styles.root, { paddingTop: insets.top, paddingLeft: insets.left, paddingRight: insets.right }]}>
      <View style={styles.header}>
        <View style={styles.brand}>
          <View style={styles.logoDot} />
          <Text style={styles.brandText}>{APP_NAME}</Text>
        </View>
        <IconButton name="refresh-outline" label="Rescan device" onPress={() => lib.rescan()} />
        <IconButton name="add-circle-outline" label="Add videos" size={28} color={colors.primary} onPress={addVideos} />
      </View>

      <SearchBar value={query} onChange={setQuery} />

      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipScroll} contentContainerStyle={styles.chipRow}>
        <Pressable onPress={() => setSheet('sort')} style={styles.chip} accessibilityRole="button" accessibilityLabel="Sort videos">
          <Ionicons name="swap-vertical-outline" size={16} color={colors.primary} />
          <Text style={styles.chipText}>{sortLabel(sort)}</Text>
        </Pressable>
        <Pressable onPress={() => setSheet('folder')} style={styles.chip} accessibilityRole="button" accessibilityLabel="Filter by folder">
          <Ionicons name="folder-outline" size={16} color={colors.primary} />
          <Text style={styles.chipText} numberOfLines={1}>{activeFolderLabel}</Text>
        </Pressable>
      </ScrollView>

      {!videoEngine.available && <Text style={styles.engineWarn}>Video engine failed to load: {videoEngine.error}</Text>}
      {lib.storageWarning && <Text style={styles.engineWarn}>Your library may not be saved: {lib.storageWarning}</Text>}

      {lib.hydrated && (
        <AccessBanner
          access={lib.access}
          detail={lib.accessDetail}
          scanError={lib.scanError}
          onAllow={() => lib.requestAccessAndScan()}
          onOpenSettings={() => Linking.openSettings()}
          onRetry={() => lib.rescan()}
        />
      )}

      {body}

      {sheet === 'sort' ? (
        <OptionSheet
          title="Sort by (tap again to reverse)"
          options={SORT_KEYS.map((k: SortKey) => ({
            key: k,
            label: k === sort.key ? `${SORT_LABEL[k]} ${sort.dir === 'asc' ? '↑' : '↓'}` : SORT_LABEL[k],
            selected: k === sort.key,
          }))}
          onSelect={(k) => setSort((s) => toggleSort(s, k as SortKey))}
          onClose={() => setSheet(null)}
        />
      ) : null}
      {sheet === 'folder' ? (
        <OptionSheet
          title="Folder"
          options={folders.map((f) => ({ key: f.key, label: `${f.label} (${f.count})`, selected: f.key === activeFolder }))}
          onSelect={setFolder}
          onClose={() => setSheet(null)}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: spacing.lg, paddingVertical: spacing.sm, gap: spacing.sm },
  brand: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  logoDot: { width: 14, height: 14, borderRadius: 7, backgroundColor: colors.primary, borderWidth: 3, borderColor: colors.secondary },
  brandText: { color: colors.text, fontSize: 22, fontWeight: '800', letterSpacing: 0.3 },
  chipScroll: { flexGrow: 0, marginTop: spacing.sm },
  chipRow: { paddingHorizontal: spacing.lg, gap: spacing.sm },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: colors.card, paddingHorizontal: spacing.md, paddingVertical: 7, borderRadius: radius.pill, maxWidth: 220 },
  chipText: { color: colors.text, fontSize: 13, fontWeight: '600' },
  engineWarn: { color: colors.warning, fontSize: 12, paddingHorizontal: spacing.lg, paddingTop: spacing.sm },
  summary: { color: colors.textSecondary, fontSize: 13, marginBottom: spacing.md },
});
