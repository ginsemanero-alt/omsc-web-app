import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { Card } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../../components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../../components/ui/dialog';
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
} from 'lucide-react';

export default function IECMaterials() {
  const [activeTab, setActiveTab] = useState('articles');
  const [materials, setMaterials] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  
  const [previewItem, setPreviewItem] = useState<any>(null);
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);

  useEffect(() => {
    fetchMaterials();
  }, []);

  async function fetchMaterials() {
    try {
      setLoading(true);
      setLoadFailed(false);
      const { data, error } = await supabase
        .from('materials')
        .select('*')
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

  const handlePreview = (item: any) => {
    setPreviewItem(item);
    setIsPreviewOpen(true);
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

  const filteredData = materials.filter(m => 
    m.title?.toLowerCase().includes(searchQuery.toLowerCase())
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
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 bg-white p-8 rounded-[2.5rem] border border-slate-100 shadow-sm">
        <div className="space-y-1">
          <h1 className="text-4xl font-black text-slate-900 tracking-tighter uppercase">
            IEC <span className="text-indigo-600">Materials</span>
          </h1>
          <p className="text-slate-500 font-medium flex items-center gap-2">
            <Calendar className="w-4 h-4 text-indigo-400" />
            Guidance Resources Library
          </p>
        </div>

        <div className="relative w-full md:w-80 group">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <Input
            placeholder="Search materials..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-11 h-12 bg-slate-50 border-none rounded-2xl focus:ring-2 focus:ring-indigo-500/20"
          />
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="bg-slate-100/50 p-1.5 rounded-2xl mb-8 border border-slate-100">
          <TabsTrigger value="articles" className="px-4 sm:px-8 rounded-xl font-bold data-[state=active]:bg-white data-[state=active]:text-indigo-600 uppercase text-xs">Articles</TabsTrigger>
          <TabsTrigger value="infographics" className="px-4 sm:px-8 rounded-xl font-bold data-[state=active]:bg-white data-[state=active]:text-indigo-600 uppercase text-xs">Infographics</TabsTrigger>
          <TabsTrigger value="videos" className="px-4 sm:px-8 rounded-xl font-bold data-[state=active]:bg-white data-[state=active]:text-indigo-600 uppercase text-xs">Videos</TabsTrigger>
          <TabsTrigger value="audio" className="px-4 sm:px-8 rounded-xl font-bold data-[state=active]:bg-white data-[state=active]:text-indigo-600 uppercase text-xs">Audio</TabsTrigger>
          <TabsTrigger value="links" className="px-4 sm:px-8 rounded-xl font-bold data-[state=active]:bg-white data-[state=active]:text-indigo-600 uppercase text-xs">Links</TabsTrigger>
        </TabsList>

        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 animate-pulse">
            {[0, 1, 2, 3].map((n) => (
              <div key={n} className="h-40 bg-slate-100 rounded-[2rem]" />
            ))}
          </div>
        ) : loadFailed ? (
          <div className="h-64 flex flex-col items-center justify-center gap-4 text-center px-4">
            <p className="text-base font-black text-slate-800 uppercase tracking-tight">
              Couldn't load materials
            </p>
            <p className="text-sm text-slate-500 max-w-sm">
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
            <TabsContent value="articles" className="grid grid-cols-1 md:grid-cols-2 gap-6 outline-none">
              {articles.length > 0 ? articles.map((item) => (
                <Card key={item.id} className="p-6 bg-white border-none shadow-sm rounded-[2rem] hover:shadow-xl transition-all group">
                  <div className="flex gap-5">
                    <div className="w-16 h-16 bg-slate-50 rounded-2xl flex items-center justify-center flex-shrink-0 group-hover:bg-indigo-50 transition-colors">
                      <FileText className="w-8 h-8 text-indigo-600" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="text-xl font-black text-slate-800 truncate uppercase mb-1">{item.title}</h3>
                      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-4">{item.format || 'Document'}</p>
                      <div className="flex gap-2">
                        <Button onClick={() => handlePreview(item)} className="flex-1 h-11 bg-slate-900 hover:bg-indigo-600 rounded-xl font-black uppercase text-xs">
                          <Eye className="w-3 h-3 mr-2" /> Preview
                        </Button>
                        <Button onClick={() => downloadFile(item.file_url, item.title)} variant="outline" className="flex-1 h-11 border-slate-200 rounded-xl font-black uppercase text-xs">
                          <Download className="w-3 h-3 mr-2" /> Save
                        </Button>
                      </div>
                    </div>
                  </div>
                </Card>
              )) : <EmptyState message="No articles found" />}
            </TabsContent>

            {/* INFOGRAPHICS TAB */}
            <TabsContent value="infographics" className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 outline-none">
              {infographics.length > 0 ? infographics.map((item) => (
                <Card key={item.id} className="overflow-hidden bg-white border-none shadow-sm rounded-[2.5rem] group hover:shadow-2xl transition-all duration-500">
                  <div className="relative h-64 bg-slate-100 overflow-hidden">
                    <img src={item.file_url} alt={item.title} className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-700" />
                    <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                      <Button onClick={() => handlePreview(item)} className="rounded-full bg-white text-slate-900 h-12 w-12 p-0 shadow-xl">
                        <Maximize2 className="w-5 h-5" />
                      </Button>
                    </div>
                  </div>
                  <div className="p-6">
                    <h3 className="font-black text-slate-800 truncate uppercase mb-4">{item.title}</h3>
                    <Button onClick={() => downloadFile(item.file_url, item.title)} className="w-full h-12 bg-slate-900 hover:bg-indigo-600 rounded-2xl font-black uppercase text-xs">
                      <Download className="w-4 h-4 mr-2" /> Download
                    </Button>
                  </div>
                </Card>
              )) : <EmptyState message="No infographics found" />}
            </TabsContent>

            {/* VIDEOS TAB */}
            <TabsContent value="videos" className="grid grid-cols-1 md:grid-cols-2 gap-6 outline-none">
              {videos.length > 0 ? videos.map((item) => (
                <Card key={item.id} className="p-8 bg-white border-none shadow-sm rounded-[2.5rem] group">
                  <div className="flex items-center gap-6">
                    <div className="w-20 h-20 bg-red-50 rounded-3xl flex items-center justify-center">
                      <Youtube className="w-10 h-10 text-red-600" />
                    </div>
                    <div className="flex-1">
                      <h3 className="text-xl font-black text-slate-800 uppercase mb-4">{item.title}</h3>
                      <Button onClick={() => handlePreview(item)} className="bg-red-600 hover:bg-red-700 h-12 px-8 rounded-2xl font-black uppercase text-xs shadow-lg shadow-red-100 text-white">
                        Watch Now
                      </Button>
                    </div>
                  </div>
                </Card>
              )) : <EmptyState message="No videos found" />}
            </TabsContent>

            {/* AUDIO TAB */}
            <TabsContent value="audio" className="grid grid-cols-1 md:grid-cols-2 gap-6 outline-none">
              {audioItems.length > 0 ? audioItems.map((item) => (
                <Card key={item.id} className="p-6 bg-white border-none shadow-sm rounded-[2rem] hover:shadow-xl transition-all group">
                  <div className="flex items-center gap-5">
                    <div className="w-16 h-16 bg-purple-50 rounded-2xl flex items-center justify-center flex-shrink-0 group-hover:bg-purple-100 transition-colors">
                      <Music className="w-8 h-8 text-purple-600" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="text-xl font-black text-slate-800 truncate uppercase mb-3">{item.title}</h3>
                      <audio src={item.file_url} controls className="w-full h-10" />
                    </div>
                  </div>
                </Card>
              )) : <EmptyState message="No audio resources found" />}
            </TabsContent>

            {/* LINKS TAB */}
            <TabsContent value="links" className="grid grid-cols-1 md:grid-cols-2 gap-6 outline-none">
              {links.length > 0 ? links.map((item) => (
                <Card key={item.id} className="p-6 bg-white border-none shadow-sm rounded-[2rem] hover:shadow-xl transition-all group">
                  <div className="flex items-center gap-5">
                    <div className="w-16 h-16 bg-indigo-50 rounded-2xl flex items-center justify-center flex-shrink-0 group-hover:bg-indigo-100 transition-colors">
                      <LinkIcon className="w-8 h-8 text-indigo-600" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="text-xl font-black text-slate-800 truncate uppercase mb-4">{item.title}</h3>
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
            </TabsContent>
          </>
        )}
      </Tabs>

      {/* --- PREVIEW MODAL --- */}
      <Dialog open={isPreviewOpen} onOpenChange={setIsPreviewOpen}>
        <DialogContent className="max-w-5xl w-[95vw] h-[90vh] p-0 overflow-hidden bg-slate-950 border-none rounded-[2rem] shadow-2xl flex flex-col">
          <DialogHeader className="p-6 bg-white border-b border-slate-100 flex flex-row items-center justify-between shrink-0">
            <div>
              <DialogTitle className="font-black uppercase tracking-tighter text-xl text-slate-900">{previewItem?.title}</DialogTitle>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-[0.2em]">Material Preview Mode</p>
            </div>
          </DialogHeader>
          
          <div className="flex-1 w-full bg-slate-900/50 flex items-center justify-center overflow-hidden relative">
            {previewItem?.type === 'Video' || previewItem?.file_url?.includes('youtube') || previewItem?.file_url?.includes('youtu.be') ? (
               <iframe
                src={getYouTubeEmbedUrl(previewItem.file_url)}
                className="w-full aspect-video max-w-4xl rounded-2xl shadow-2xl border-none"
                allowFullScreen
                title="YouTube Video"
              />
            ) : previewItem?.file_url?.toLowerCase().endsWith('.pdf') ? (
              // Embedding PDFs via <iframe src="file.pdf"> depends on the
              // browser having a built-in PDF viewer — desktop Chrome
              // usually does, but mobile Chrome/Safari generally don't, and
              // silently render "This page has been blocked by Chrome"
              // inside the iframe instead (unrecoverable from here, since
              // cross-origin iframes give the parent page no way to detect
              // that failure). Opening it directly is the one approach
              // that works the same everywhere.
              <div className="p-8 w-full max-w-xl flex flex-col items-center gap-6 text-center">
                <div className="w-24 h-24 rounded-3xl bg-rose-500/10 flex items-center justify-center">
                  <FileText className="w-12 h-12 text-rose-400" />
                </div>
                <p className="text-slate-300 text-sm">
                  PDF preview opens best in its own tab.
                </p>
                <a
                  href={previewItem.file_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 h-12 px-8 rounded-2xl bg-indigo-600 hover:bg-indigo-700 text-white font-black uppercase text-xs"
                >
                  Open PDF <ExternalLink className="w-4 h-4" />
                </a>
              </div>
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
                <HardDrive className="w-16 h-16 text-slate-700 mx-auto" />
                <p className="font-bold text-slate-500 mt-4 uppercase text-xs">Format not supported for preview</p>
              </div>
            )}
          </div>
          
          <div className="p-4 bg-white border-t border-slate-100 flex justify-end gap-3 shrink-0">
            <Button variant="ghost" onClick={() => setIsPreviewOpen(false)} className="rounded-xl font-bold uppercase text-[10px]">Close</Button>
            
            {/* Hide download button for streaming/external-link types */}
            {previewItem?.type !== 'Video' && previewItem?.type !== 'Link' && !previewItem?.file_url?.includes('youtube') && (
              <Button onClick={() => downloadFile(previewItem.file_url, previewItem.title)} className="bg-indigo-600 rounded-xl font-black uppercase text-[10px] px-6 text-white">
                Download Resource
              </Button>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="col-span-full py-32 text-center bg-slate-50/50 rounded-[3rem] border-4 border-dashed border-slate-100">
      <HardDrive className="w-16 h-16 text-slate-200 mx-auto mb-4" />
      <p className="text-slate-400 font-black uppercase text-xl tracking-tighter">{message}</p>
    </div>
  );
}