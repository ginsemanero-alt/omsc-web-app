import { useState, useEffect, Suspense, lazy } from 'react';
import { supabase } from '../../lib/supabase';
import { Card } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../../components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../../components/ui/dialog';
import { PaginationControls } from '../../components/ui/pagination-controls';
import { usePagination } from '../../hooks/usePagination';
import { logActivity } from '../../lib/activityLog';
import { useAuth } from '../../hooks/useAuth';
import { IEC_CATEGORIES } from '../../lib/iecCategories';
// Lazy: pdfjs-dist is a large library (~500KB+) — no reason to ship it in
// this chunk unless someone actually opens a PDF preview.
const PdfPreview = lazy(() => import('../shared/PdfPreview'));

const MATERIALS_PAGE_SIZE = 12;
import {
  FileText,
  Image as ImageIcon,
  Video,
  Download,
  Eye,
  HardDrive,
  Search,
  Calendar,
  X,
  Maximize2,
  Youtube,
  Music,
  Link as LinkIcon,
  ExternalLink,
  Loader2,
} from 'lucide-react';

export default function IECMaterials() {
  const { user, userName: authUserName } = useAuth();
  const [activeTab, setActiveTab] = useState('articles');
  const [materials, setMaterials] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('All');

  const [previewItem, setPreviewItem] = useState<any>(null);
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);

  useEffect(() => {
    fetchMaterials();
  }, []);

  // Warms up pdfjs's worker in the background as soon as this list has a
  // PDF to show, well before anyone opens a preview. Profiled against a
  // throttled CPU (standing in for a mid/low-range Android phone): the
  // "Loading PDF..." delay wasn't the network — it was the browser
  // parsing and initializing pdfjs's ~1.2MB worker script itself, which
  // only used to start after someone opened a preview.
  useEffect(() => {
    const hasPdf = materials.some(
      (m) => m.type === 'PDF' || m.type === 'Document' || m.file_url?.toLowerCase().split('?')[0].endsWith('.pdf')
    );
    if (!hasPdf) return;

    const timer = window.setTimeout(() => {
      import('../shared/PdfPreview').then((mod) => mod.warmPdfWorker());
    }, 1500);
    return () => window.clearTimeout(timer);
  }, [materials]);

  async function fetchMaterials() {
    try {
      setLoading(true);
      setLoadFailed(false);
      // Program handouts live in this same table (materials.program_id
      // set, uploaded via Program Manager) but belong only to that one
      // program's own details panel — excluding them here is what keeps
      // them from leaking into Articles/Infographics/etc. alongside the
      // real IEC Library.
      const { data, error } = await supabase
        .from('materials')
        .select('*')
        .is('program_id', null)
        .is('archived_at', null)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setMaterials(data || []);
    } catch (error) {
      console.error('Error fetching materials:', error);
      setLoadFailed(true);
    } finally {
      setLoading(false);
    }
  }

  // Once per material per browser session, same reasoning as the
  // Programs & Activities page view log (PHASE 12) — an admin wants to
  // know who opened what and when, not a row for every re-open of a
  // preview or repeat download of something already opened. Called from
  // BOTH handlePreview and the download handler (the primary button on
  // an infographic card is Download, not Preview, so a student who never
  // previews would otherwise never show up here at all), sharing one
  // sessionStorage flag so doing both in one session still logs once.
  const logMaterialView = (item: any) => {
    if (!user?.email) return;
    const flagKey = `logged_material_view_${item.id}`;
    if (sessionStorage.getItem(flagKey)) return;
    sessionStorage.setItem(flagKey, '1');
    logActivity({
      actorEmail: user.email,
      actorName: authUserName,
      action: 'view',
      entityType: 'material',
      entityId: item.id,
      entityLabel: item.title,
      details: `category: ${item.category ?? 'Unknown'}`,
    });
  };

  const handlePreview = (item: any) => {
    setPreviewItem(item);
    setIsPreviewOpen(true);
    logMaterialView(item);
  };

  const downloadFile = async (url: string, filename: string) => {
    try {
      const response = await fetch(url);
      const blob = await response.blob();
      const blobUrl = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = blobUrl;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (err) {
      window.location.href = url;
    }
  };

  // Analytics' "IEC Downloads" figure reads materials.downloads, but
  // nothing ever wrote to it — every download button called downloadFile()
  // alone, so the count stayed 0 forever regardless of real usage. The RPC
  // does the increment atomically in the database (materials RLS only
  // allows admins to UPDATE directly, and a plain read-then-write from
  // here would also lose increments if two students downloaded at once).
  // Fire-and-forget: a failed count bump should never block or interrupt
  // an actual download.
  const incrementDownloadCount = (materialId: number) => {
    supabase.rpc('increment_material_downloads', { material_id: materialId })
      .then(({ error }) => { if (error) console.warn('Download count update failed:', error.message); });
  };

  const filteredData = materials.filter(m =>
    m.title?.toLowerCase().includes(searchQuery.toLowerCase()) &&
    (selectedCategory === 'All' || m.category === selectedCategory)
  );

  // --- FILTERS ---
  // The admin now picks an explicit type on upload (PDF / Image / Video /
  // Audio / Link), which is the reliable signal. The extension/URL checks
  // are kept only as a fallback for older rows uploaded before that existed.
  const articles = filteredData.filter(m =>
    m.type === 'PDF' || m.type === 'Document' || m.file_url?.toLowerCase().split('?')[0].endsWith('.pdf')
  );

  const infographics = filteredData.filter(m =>
    m.type === 'Image' || /\.(jpg|jpeg|png|webp|gif)(\?.*)?$/i.test(m.file_url || '')
  );

  const videos = filteredData.filter(m =>
    m.type === 'Video' || m.file_url?.includes('youtube.com') || m.file_url?.includes('youtu.be')
  );

  const audioItems = filteredData.filter(m =>
    m.type === 'Audio' || /\.(mp3|wav|ogg|m4a)(\?.*)?$/i.test(m.file_url || '')
  );

  const links = filteredData.filter(m => m.type === 'Link');

  // Each tab paginates independently — switching tabs shows a completely
  // different list.
  const { page: articlesPage, setPage: setArticlesPage, totalPages: articlesTotalPages, pageItems: pagedArticles } = usePagination(articles, MATERIALS_PAGE_SIZE);
  const { page: infographicsPage, setPage: setInfographicsPage, totalPages: infographicsTotalPages, pageItems: pagedInfographics } = usePagination(infographics, MATERIALS_PAGE_SIZE);
  const { page: videosPage, setPage: setVideosPage, totalPages: videosTotalPages, pageItems: pagedVideos } = usePagination(videos, MATERIALS_PAGE_SIZE);
  const { page: audioPage, setPage: setAudioPage, totalPages: audioTotalPages, pageItems: pagedAudio } = usePagination(audioItems, MATERIALS_PAGE_SIZE);
  const { page: linksPage, setPage: setLinksPage, totalPages: linksTotalPages, pageItems: pagedLinks } = usePagination(links, MATERIALS_PAGE_SIZE);

  useEffect(() => {
    setArticlesPage(1);
    setInfographicsPage(1);
    setVideosPage(1);
    setAudioPage(1);
    setLinksPage(1);
  }, [searchQuery, selectedCategory]);

  // Helper function to format YouTube URLs for iframe
  const getYouTubeEmbedUrl = (url: string) => {
    if (!url) return '';
    let videoId = '';
    if (url.includes('v=')) {
      videoId = url.split('v=')[1]?.split('&')[0];
    } else if (url.includes('youtu.be/')) {
      videoId = url.split('youtu.be/')[1]?.split('?')[0];
    }
    return videoId ? `https://www.youtube.com/embed/${videoId}` : url;
  };

  return (
    <div className="space-y-8 p-6 max-w-7xl mx-auto animate-in fade-in duration-700">
      {/* Header Section */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 bg-white dark:bg-slate-900 p-8 rounded-[2.5rem] border border-slate-100 dark:border-slate-800 shadow-sm">
        <div className="space-y-1">
          <h1 className="text-4xl font-black text-slate-900 dark:text-white tracking-tighter uppercase">
            IEC <span className="text-indigo-600">Materials</span>
          </h1>
          <p className="text-slate-500 dark:text-slate-400 font-medium flex items-center gap-2">
            <Calendar className="w-4 h-4 text-indigo-400" />
            Guidance Resources Library
          </p>
        </div>

        <div className="flex flex-col sm:flex-row gap-3 w-full md:w-auto">
          <div className="relative w-full md:w-80 group">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <Input
              placeholder="Search materials..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-11 h-12 bg-slate-50 dark:bg-slate-800 border-none rounded-2xl focus:ring-2 focus:ring-indigo-500/20"
            />
          </div>

          <select
            value={selectedCategory}
            onChange={(e) => setSelectedCategory(e.target.value)}
            className="h-12 px-4 bg-slate-50 dark:bg-slate-800 dark:text-white border-none rounded-2xl font-bold text-sm text-slate-600 outline-none focus:ring-2 focus:ring-indigo-500/20"
          >
            <option value="All">All IEC Categories</option>
            {IEC_CATEGORIES.map((category) => (
              <option key={category} value={category}>{category}</option>
            ))}
          </select>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="bg-slate-100/50 dark:bg-slate-800/50 p-1.5 rounded-2xl mb-8 border border-slate-100 dark:border-slate-800">
          <TabsTrigger value="articles" className="px-4 sm:px-8 rounded-xl font-bold data-[state=active]:bg-white dark:data-[state=active]:bg-slate-900 data-[state=active]:text-indigo-600 dark:data-[state=active]:text-indigo-400 uppercase text-xs">Articles</TabsTrigger>
          <TabsTrigger value="infographics" className="px-4 sm:px-8 rounded-xl font-bold data-[state=active]:bg-white dark:data-[state=active]:bg-slate-900 data-[state=active]:text-indigo-600 dark:data-[state=active]:text-indigo-400 uppercase text-xs">Infographics</TabsTrigger>
          <TabsTrigger value="videos" className="px-4 sm:px-8 rounded-xl font-bold data-[state=active]:bg-white dark:data-[state=active]:bg-slate-900 data-[state=active]:text-indigo-600 dark:data-[state=active]:text-indigo-400 uppercase text-xs">Videos</TabsTrigger>
          <TabsTrigger value="audio" className="px-4 sm:px-8 rounded-xl font-bold data-[state=active]:bg-white dark:data-[state=active]:bg-slate-900 data-[state=active]:text-indigo-600 dark:data-[state=active]:text-indigo-400 uppercase text-xs">Audio</TabsTrigger>
          <TabsTrigger value="links" className="px-4 sm:px-8 rounded-xl font-bold data-[state=active]:bg-white dark:data-[state=active]:bg-slate-900 data-[state=active]:text-indigo-600 dark:data-[state=active]:text-indigo-400 uppercase text-xs">Links</TabsTrigger>
        </TabsList>

        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 animate-pulse">
            {[0, 1, 2, 3].map((n) => (
              <div key={n} className="h-40 bg-slate-100 dark:bg-slate-800 rounded-[2rem]" />
            ))}
          </div>
        ) : loadFailed ? (
          <div className="h-64 flex flex-col items-center justify-center gap-4 text-center px-4">
            <p className="text-base font-black text-slate-800 dark:text-slate-100 uppercase tracking-tight">
              Couldn't load materials
            </p>
            <p className="text-sm text-slate-500 dark:text-slate-400 max-w-sm">
              Check your internet connection and try again.
            </p>
            <Button
              onClick={fetchMaterials}
              className="h-11 px-8 rounded-xl bg-slate-900 hover:bg-indigo-600 text-white font-black uppercase text-[10px] tracking-widest"
            >
              Try Again
            </Button>
          </div>
        ) : (
          <>
            {/* ARTICLES TAB */}
            <TabsContent value="articles" className="outline-none">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {articles.length > 0 ? pagedArticles.map((item) => (
                <Card key={item.id} className="p-6 bg-white dark:bg-slate-900 border-none shadow-sm rounded-[2rem] hover:shadow-xl transition-all group">
                  <div className="flex gap-5">
                    <div className="w-16 h-16 bg-slate-50 dark:bg-slate-800 rounded-2xl flex items-center justify-center flex-shrink-0 group-hover:bg-indigo-50 transition-colors">
                      <FileText className="w-8 h-8 text-indigo-600" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <MaterialCategoryBadge category={item.category} />
                      <h3 className="text-xl font-black text-slate-800 dark:text-slate-100 truncate uppercase mb-1">{item.title}</h3>
                      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">{item.format || 'Document'}</p>
                      {item.description && (
                        <p className="text-xs text-slate-500 dark:text-slate-400 line-clamp-2 mb-3">{item.description}</p>
                      )}
                      <div className="flex flex-wrap gap-2">
                        {/* min-w-[90px] + flex-wrap: on a container too
                            narrow for both at a readable size, they wrap to
                            full-width stacked buttons instead of getting
                            squeezed to unreadable slivers (flex-1 alone
                            can't shrink past a button's own content width
                            anyway, since Button's whitespace-nowrap base
                            style gives it an intrinsic min-width). */}
                        <Button onClick={() => handlePreview(item)} className="flex-1 min-w-[90px] h-11 bg-slate-900 hover:bg-indigo-600 rounded-xl font-black uppercase text-xs">
                          <Eye className="w-3 h-3 mr-2 shrink-0" /> Preview
                        </Button>
                        <Button onClick={() => { downloadFile(item.file_url, item.title); incrementDownloadCount(item.id); logMaterialView(item); }} variant="outline" className="flex-1 min-w-[90px] h-11 border-slate-200 dark:border-slate-700 rounded-xl font-black uppercase text-xs">
                          <Download className="w-3 h-3 mr-2 shrink-0" /> Save
                        </Button>
                      </div>
                    </div>
                  </div>
                </Card>
              )) : <EmptyState message="No articles found" />}
            </div>
            <PaginationControls page={articlesPage} totalPages={articlesTotalPages} totalItems={articles.length} pageSize={MATERIALS_PAGE_SIZE} onPageChange={setArticlesPage} className="mt-6" />
            </TabsContent>

            {/* INFOGRAPHICS TAB */}
            <TabsContent value="infographics" className="outline-none">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {infographics.length > 0 ? pagedInfographics.map((item) => (
                <Card key={item.id} className="overflow-hidden bg-white dark:bg-slate-900 border-none shadow-sm rounded-[2.5rem] group hover:shadow-2xl transition-all duration-500">
                  <div
                    className="relative h-64 bg-slate-100 dark:bg-slate-800 overflow-hidden cursor-pointer"
                    onClick={() => handlePreview(item)}
                  >
                    {/* object-contain, not -cover: these are infographics —
                        tall, information-dense, and often a different aspect
                        ratio than this box. Cropping to fill was cutting off
                        real content (a header, a whole panel of text) rather
                        than trimming empty margin the way it does on a photo. */}
                    <img src={item.file_url} alt={item.title} className="w-full h-full object-contain group-hover:scale-105 transition-transform duration-700" />
                    {/* Darkened backdrop + centered zoom icon is a nice-to-
                        have hover effect on desktop only — purely
                        decorative, so it's fine to skip on touch devices
                        with no :hover. The whole thumbnail is clickable on
                        every device regardless (see onClick above); the
                        corner button below stays as a visible affordance on
                        touch devices where hover never shows. */}
                    <div className="absolute inset-0 bg-black/30 opacity-0 md:group-hover:opacity-100 transition-opacity pointer-events-none flex items-center justify-center">
                      <Maximize2 className="w-8 h-8 text-white opacity-0 md:group-hover:opacity-100 transition-opacity" />
                    </div>
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); handlePreview(item); }}
                      className="absolute top-3 right-3 w-9 h-9 rounded-full bg-white/90 dark:bg-slate-900/90 text-slate-900 dark:text-white shadow-lg flex items-center justify-center hover:bg-white dark:hover:bg-slate-900 transition-colors"
                      aria-label="Preview"
                    >
                      <Maximize2 className="w-4 h-4" />
                    </button>
                  </div>
                  <div className="p-6">
                    <MaterialCategoryBadge category={item.category} />
                    <h3 className="font-black text-slate-800 dark:text-slate-100 truncate uppercase mb-1">{item.title}</h3>
                    {item.description && (
                      <p className="text-xs text-slate-500 dark:text-slate-400 line-clamp-2 mb-4">{item.description}</p>
                    )}
                    <Button onClick={() => { downloadFile(item.file_url, item.title); incrementDownloadCount(item.id); logMaterialView(item); }} className="w-full h-12 bg-slate-900 hover:bg-indigo-600 rounded-2xl font-black uppercase text-xs">
                      <Download className="w-4 h-4 mr-2" /> Download
                    </Button>
                  </div>
                </Card>
              )) : <EmptyState message="No infographics found" />}
            </div>
            <PaginationControls page={infographicsPage} totalPages={infographicsTotalPages} totalItems={infographics.length} pageSize={MATERIALS_PAGE_SIZE} onPageChange={setInfographicsPage} className="mt-6" />
            </TabsContent>

            {/* VIDEOS TAB */}
            <TabsContent value="videos" className="outline-none">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {videos.length > 0 ? pagedVideos.map((item) => (
                <Card key={item.id} className="p-8 bg-white dark:bg-slate-900 border-none shadow-sm rounded-[2.5rem] group">
                  <div className="flex items-center gap-6">
                    <div className="w-20 h-20 bg-red-50 rounded-3xl flex items-center justify-center">
                      <Youtube className="w-10 h-10 text-red-600" />
                    </div>
                    <div className="flex-1">
                      <MaterialCategoryBadge category={item.category} />
                      <h3 className="text-xl font-black text-slate-800 dark:text-slate-100 uppercase mb-1">{item.title}</h3>
                      {item.description && (
                        <p className="text-xs text-slate-500 dark:text-slate-400 line-clamp-2 mb-4">{item.description}</p>
                      )}
                      <Button onClick={() => handlePreview(item)} className="bg-red-600 hover:bg-red-700 h-12 px-8 rounded-2xl font-black uppercase text-xs shadow-lg shadow-red-100 text-white">
                        Watch Now
                      </Button>
                    </div>
                  </div>
                </Card>
              )) : <EmptyState message="No videos found" />}
            </div>
            <PaginationControls page={videosPage} totalPages={videosTotalPages} totalItems={videos.length} pageSize={MATERIALS_PAGE_SIZE} onPageChange={setVideosPage} className="mt-6" />
            </TabsContent>

            {/* AUDIO TAB */}
            <TabsContent value="audio" className="outline-none">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {audioItems.length > 0 ? pagedAudio.map((item) => (
                <Card key={item.id} className="p-6 bg-white dark:bg-slate-900 border-none shadow-sm rounded-[2rem] hover:shadow-xl transition-all group">
                  <div className="flex items-center gap-5">
                    <div className="w-16 h-16 bg-purple-50 rounded-2xl flex items-center justify-center flex-shrink-0 group-hover:bg-purple-100 transition-colors">
                      <Music className="w-8 h-8 text-purple-600" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <MaterialCategoryBadge category={item.category} />
                      <h3 className="text-xl font-black text-slate-800 dark:text-slate-100 truncate uppercase mb-1">{item.title}</h3>
                      {item.description && (
                        <p className="text-xs text-slate-500 dark:text-slate-400 line-clamp-2 mb-3">{item.description}</p>
                      )}
                      <audio src={item.file_url} controls className="w-full h-10" />
                    </div>
                  </div>
                </Card>
              )) : <EmptyState message="No audio resources found" />}
            </div>
            <PaginationControls page={audioPage} totalPages={audioTotalPages} totalItems={audioItems.length} pageSize={MATERIALS_PAGE_SIZE} onPageChange={setAudioPage} className="mt-6" />
            </TabsContent>

            {/* LINKS TAB */}
            <TabsContent value="links" className="outline-none">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {links.length > 0 ? pagedLinks.map((item) => (
                <Card key={item.id} className="p-6 bg-white dark:bg-slate-900 border-none shadow-sm rounded-[2rem] hover:shadow-xl transition-all group">
                  <div className="flex items-center gap-5">
                    <div className="w-16 h-16 bg-indigo-50 rounded-2xl flex items-center justify-center flex-shrink-0 group-hover:bg-indigo-100 transition-colors">
                      <LinkIcon className="w-8 h-8 text-indigo-600" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <MaterialCategoryBadge category={item.category} />
                      <h3 className="text-xl font-black text-slate-800 dark:text-slate-100 truncate uppercase mb-1">{item.title}</h3>
                      {item.description && (
                        <p className="text-xs text-slate-500 dark:text-slate-400 line-clamp-2 mb-4">{item.description}</p>
                      )}
                      <a
                        href={item.file_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-2 h-11 px-6 bg-slate-900 hover:bg-indigo-600 rounded-xl font-black uppercase text-xs text-white transition-colors"
                      >
                        Open Resource <ExternalLink className="w-3.5 h-3.5" />
                      </a>
                    </div>
                  </div>
                </Card>
              )) : <EmptyState message="No linked resources found" />}
            </div>
            <PaginationControls page={linksPage} totalPages={linksTotalPages} totalItems={links.length} pageSize={MATERIALS_PAGE_SIZE} onPageChange={setLinksPage} className="mt-6" />
            </TabsContent>
          </>
        )}
      </Tabs>

      {/* --- PREVIEW MODAL --- */}
      <Dialog open={isPreviewOpen} onOpenChange={setIsPreviewOpen}>
        <DialogContent className="max-w-5xl w-[95vw] h-[90vh] p-0 overflow-hidden bg-slate-950 border-none rounded-[2rem] shadow-2xl flex flex-col">
          <DialogHeader className="p-6 bg-white dark:bg-slate-900 border-b border-slate-100 dark:border-slate-800 flex flex-row items-center justify-between shrink-0">
            <div>
              <DialogTitle className="font-black uppercase tracking-tighter text-xl text-slate-900 dark:text-white">{previewItem?.title}</DialogTitle>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-[0.2em]">Material Preview Mode</p>
            </div>
          </DialogHeader>
          
          <div className="flex-1 w-full bg-slate-900/50 flex items-center justify-center overflow-hidden relative">
            {previewItem?.file_url?.includes('youtube') || previewItem?.file_url?.includes('youtu.be') ? (
               <iframe
                src={getYouTubeEmbedUrl(previewItem.file_url)}
                className="w-full aspect-video max-w-4xl rounded-2xl shadow-2xl border-none"
                allowFullScreen
                title="YouTube Video"
              />
            ) : previewItem?.type === 'Video' && previewItem?.file_url ? (
              // Self-hosted upload, not YouTube — native <video> controls
              // already include a fullscreen button on every browser.
              <video
                src={previewItem.file_url}
                controls
                autoPlay
                playsInline
                className="w-full max-h-full max-w-4xl rounded-2xl shadow-2xl"
              />
            ) : previewItem?.file_url?.toLowerCase().endsWith('.pdf') ? (
              <Suspense
                fallback={
                  <div className="flex flex-col items-center justify-center gap-3">
                    <Loader2 className="w-8 h-8 animate-spin text-indigo-400" />
                    <p className="text-[10px] font-black uppercase tracking-widest text-slate-500 dark:text-slate-400">
                      Loading PDF...
                    </p>
                  </div>
                }
              >
                <PdfPreview url={previewItem.file_url} />
              </Suspense>
            ) : /\.(jpg|jpeg|png|webp|gif)$/i.test(previewItem?.file_url || '') ? (
              <div className="p-4 w-full h-full flex items-center justify-center">
                <img src={previewItem.file_url} className="max-w-full max-h-full object-contain rounded-lg shadow-2xl" alt="Preview" />
              </div>
            ) : previewItem?.type === 'Audio' ? (
              <div className="p-8 w-full max-w-xl flex flex-col items-center gap-6">
                <div className="w-24 h-24 rounded-3xl bg-purple-500/10 flex items-center justify-center">
                  <Music className="w-12 h-12 text-purple-400" />
                </div>
                <audio src={previewItem.file_url} controls className="w-full" />
              </div>
            ) : previewItem?.type === 'Link' ? (
              <div className="p-8 w-full max-w-xl flex flex-col items-center gap-6 text-center">
                <div className="w-24 h-24 rounded-3xl bg-indigo-500/10 flex items-center justify-center">
                  <LinkIcon className="w-12 h-12 text-indigo-400" />
                </div>
                <p className="text-slate-300 text-sm break-all">{previewItem.file_url}</p>
                <a
                  href={previewItem.file_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 h-12 px-8 rounded-2xl bg-indigo-600 hover:bg-indigo-700 text-white font-black uppercase text-xs"
                >
                  Open in New Tab <ExternalLink className="w-4 h-4" />
                </a>
              </div>
            ) : (
              <div className="text-center">
                <HardDrive className="w-16 h-16 text-slate-700 dark:text-slate-200 mx-auto" />
                <p className="font-bold text-slate-500 dark:text-slate-400 mt-4 uppercase text-xs">Format not supported for preview</p>
              </div>
            )}
          </div>
          
          <div className="p-4 bg-white dark:bg-slate-900 border-t border-slate-100 dark:border-slate-800 flex justify-end gap-3 shrink-0">
            <Button variant="ghost" onClick={() => setIsPreviewOpen(false)} className="rounded-xl font-bold uppercase text-[10px]">Close</Button>
            
            {/* Hide download for streaming/external-link types — a YouTube
                embed and a plain external Link have nothing to actually
                download, but a self-hosted Video upload does. */}
            {previewItem?.type !== 'Link' &&
              !previewItem?.file_url?.includes('youtube') &&
              !previewItem?.file_url?.includes('youtu.be') && (
              <Button onClick={() => { downloadFile(previewItem.file_url, previewItem.title); incrementDownloadCount(previewItem.id); logMaterialView(previewItem); }} className="bg-indigo-600 rounded-xl font-black uppercase text-[10px] px-6 text-white">
                Download Resource
              </Button>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// Same badge style as MaterialCategory in admin's MaterialLibrary.tsx —
// not imported from there since that component isn't exported, but kept
// visually identical so a category means the same thing in both places.
function MaterialCategoryBadge({ category }: { category?: string | null }) {
  return (
    <span className="inline-block px-2 py-0.5 bg-indigo-50 dark:bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 font-black uppercase text-[8px] tracking-wider rounded mb-1.5">
      {category || 'General Guidance'}
    </span>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="col-span-full py-32 text-center bg-slate-50/50 dark:bg-slate-800/50 rounded-[3rem] border-4 border-dashed border-slate-100 dark:border-slate-800">
      <HardDrive className="w-16 h-16 text-slate-200 mx-auto mb-4" />
      <p className="text-slate-400 font-black uppercase text-xl tracking-tighter">{message}</p>
    </div>
  );
}