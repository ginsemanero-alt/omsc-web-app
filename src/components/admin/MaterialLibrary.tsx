import { useEffect, useRef, useState, Suspense, lazy } from 'react';
import { supabase } from '../../lib/supabase';
import { compressImageFile } from '../../lib/imageCompress';
// Lazy: pdfjs-dist is a large library (~500KB+) — no reason to ship it in
// this chunk unless someone actually opens a PDF preview.
const PdfPreview = lazy(() => import('../shared/PdfPreview'));

import { Card } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '../../components/ui/tabs';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '../../components/ui/dialog';
import { Label } from '../../components/ui/label';
import { Textarea } from '../../components/ui/textarea';
import { useToast } from '../../hooks/use-toast';

import {
  FileText,
  Download,
  Eye,
  Loader2,
  HardDrive,
  Search,
  Calendar,
  Maximize2,
  Youtube,
  Music,
  Link as LinkIcon,
  Plus,
  Edit,
  Trash2,
  Camera,
  AlertCircle,
  Tag,
  Filter,
} from 'lucide-react';

type MaterialType = 'PDF' | 'Image' | 'Video' | 'Audio' | 'Link';

const IEC_CATEGORIES = [
  'Guidance Services',
  'Academic Development',
  'Career Development',
  'Personal & Social Development',
  'Mental Health & Wellness',
  'Psychological Testing & Assessment',
  'Safe & Positive Learning Environment',
  'Student Programs & Resources',
] as const;

const PROGRAM_COMPONENTS = [
  'Group Guidance',
  'Individual Student Planning',
  'Responsive Services',
  'System Support',
] as const;

interface Material {
  id: number;
  title: string;
  type: MaterialType;
  category: string;
  program_component?: string | null;
  tags?: string[] | null;
  description?: string | null;
  image_url?: string | null;
  file_url?: string | null;
  created_at?: string;
}

interface FormData {
  title: string;
  type: MaterialType;
  category: string;
  program_component: string;
  tags: string;
  description: string;
  file_url: string;
}

const DEFAULT_FORM: FormData = {
  title: '',
  type: 'PDF',
  category: IEC_CATEGORIES[0],
  program_component: PROGRAM_COMPONENTS[0],
  tags: '',
  description: '',
  file_url: '',
};

export default function IECMaterials() {
  const { toast } = useToast();

  const [activeTab, setActiveTab] = useState('articles');
  const [materials, setMaterials] = useState<Material[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [selectedComponent, setSelectedComponent] = useState('All');
  const [selectedTag, setSelectedTag] = useState('All');

  // Preview
  const [previewItem, setPreviewItem] = useState<Material | null>(null);
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);

  // Add / Edit
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);

  // Delete
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [deleteTargetId, setDeleteTargetId] = useState<number | null>(null);
  const [deleteTargetTitle, setDeleteTargetTitle] = useState('');

  // Files
  const imageInputRef = useRef<HTMLInputElement>(null);
  const documentInputRef = useRef<HTMLInputElement>(null);

  const audioInputRef = useRef<HTMLInputElement>(null);

  const [selectedImage, setSelectedImage] = useState<File | null>(null);
  const [previewImageUrl, setPreviewImageUrl] = useState('');
  const [attachedDocument, setAttachedDocument] = useState<File | null>(null);
  const [attachedAudio, setAttachedAudio] = useState<File | null>(null);

  const [formData, setFormData] = useState<FormData>(DEFAULT_FORM);

  useEffect(() => {
    fetchMaterials();
  }, []);

  // =========================================================
  // FETCH
  // =========================================================

  async function fetchMaterials() {
    try {
      setLoading(true);

      const { data, error } = await supabase
        .from('materials')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) {
        throw error;
      }

      setMaterials((data || []) as Material[]);
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'Fetch Error',
        description: error?.message || 'Unable to load materials.',
      });
    } finally {
      setLoading(false);
    }
  }

  // =========================================================
  // OPEN ADD / EDIT
  // =========================================================

  const handleOpenDialog = (material?: Material) => {
    if (material) {
      setEditingId(material.id);

      setFormData({
        title: material.title || '',
        type: material.type || 'PDF',
        category: IEC_CATEGORIES.includes(material.category as any)
          ? material.category
          : IEC_CATEGORIES[0],
        program_component: material.program_component || PROGRAM_COMPONENTS[0],
        tags: (material.tags || []).join(', '),
        description: material.description || '',
        file_url:
          material.type === 'Video' || material.type === 'Link'
            ? material.file_url || ''
            : '',
      });

      setPreviewImageUrl(material.image_url || '');
    } else {
      setEditingId(null);
      setFormData({ ...DEFAULT_FORM });
      setPreviewImageUrl('');
    }

    setSelectedImage(null);
    setAttachedDocument(null);
    setAttachedAudio(null);

    if (imageInputRef.current) {
      imageInputRef.current.value = '';
    }

    if (documentInputRef.current) {
      documentInputRef.current.value = '';
    }

    if (audioInputRef.current) {
      audioInputRef.current.value = '';
    }

    setIsDialogOpen(true);
  };

  // =========================================================
  // FILE VALIDATION
  // =========================================================

  const validateImage = (file: File) => {
    if (!file.type.startsWith('image/')) {
      toast({
        variant: 'destructive',
        title: 'Invalid Image',
        description: 'Please select a valid image file.',
      });

      return false;
    }

    return true;
  };

  const validatePdf = (file: File) => {
    const isPdf =
      file.type === 'application/pdf' ||
      file.name.toLowerCase().endsWith('.pdf');

    if (!isPdf) {
      toast({
        variant: 'destructive',
        title: 'Invalid Document',
        description: 'Only PDF files are allowed.',
      });

      return false;
    }

    return true;
  };

  const validateAudio = (file: File) => {
    if (!file.type.startsWith('audio/')) {
      toast({
        variant: 'destructive',
        title: 'Invalid Audio File',
        description: 'Please select a valid audio file.',
      });

      return false;
    }

    return true;
  };

  // =========================================================
  // IMAGE SELECT
  // =========================================================

  const handleImageSelect = (
    event: React.ChangeEvent<HTMLInputElement>,
    isMainImage = false
  ) => {
    const file = event.target.files?.[0];

    if (!file) return;

    if (!validateImage(file)) {
      event.target.value = '';
      return;
    }

    setSelectedImage(file);

    // Preview only for image material
    if (isMainImage || formData.type === 'Image') {
      const objectUrl = URL.createObjectURL(file);
      setPreviewImageUrl(objectUrl);
    }
  };

  // =========================================================
  // PDF SELECT
  // =========================================================

  const handleDocumentSelect = (
    event: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = event.target.files?.[0];

    if (!file) return;

    if (!validatePdf(file)) {
      event.target.value = '';
      return;
    }

    setAttachedDocument(file);
  };

  // =========================================================
  // AUDIO SELECT
  // =========================================================

  const handleAudioSelect = (
    event: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = event.target.files?.[0];

    if (!file) return;

    if (!validateAudio(file)) {
      event.target.value = '';
      return;
    }

    setAttachedAudio(file);
  };

  // =========================================================
  // UPLOAD STORAGE FILE
  // =========================================================

  const uploadFile = async (
    bucket: string,
    folder: string,
    file: File
  ): Promise<string> => {
    // No-ops for non-image files (video/audio/PDF) and already-small
    // images — only resizes oversized thumbnails/image materials.
    const compressed = await compressImageFile(file);

    const safeFileName = compressed.name.replace(/[^a-zA-Z0-9._-]/g, '_');

    const path = `${folder}/${Date.now()}_${safeFileName}`;

    // Path always includes Date.now(), so the same URL can never point to
    // different content later — safe to cache for a full year instead of
    // the previous 1 hour default.
    const { error } = await supabase.storage
      .from(bucket)
      .upload(path, compressed, {
        cacheControl: '31536000',
        upsert: false,
      });

    if (error) {
      throw error;
    }

    const { data } = supabase.storage
      .from(bucket)
      .getPublicUrl(path);

    return data.publicUrl;
  };

  // =========================================================
  // SAVE
  // =========================================================

  const handleSave = async () => {
    if (!formData.title.trim()) {
      toast({
        variant: 'destructive',
        title: 'Missing Title',
        description: 'Please enter a material title.',
      });

      return;
    }

    if (formData.type === 'Video' && !formData.file_url.trim()) {
      toast({
        variant: 'destructive',
        title: 'Missing Video URL',
        description: 'Please enter a YouTube URL.',
      });

      return;
    }

    if (formData.type === 'Link' && !formData.file_url.trim()) {
      toast({
        variant: 'destructive',
        title: 'Missing Link URL',
        description: 'Please enter the resource URL.',
      });

      return;
    }

    if (formData.type === 'PDF' && !editingId && !attachedDocument) {
      toast({
        variant: 'destructive',
        title: 'Missing PDF',
        description: 'Please attach a PDF document.',
      });

      return;
    }

    if (formData.type === 'Image' && !editingId && !selectedImage) {
      toast({
        variant: 'destructive',
        title: 'Missing Image',
        description: 'Please select an infographic image.',
      });

      return;
    }

    if (formData.type === 'Audio' && !editingId && !attachedAudio) {
      toast({
        variant: 'destructive',
        title: 'Missing Audio File',
        description: 'Please attach an audio file.',
      });

      return;
    }

    try {
      setLoading(true);

      const existingMaterial = editingId
        ? materials.find((material) => material.id === editingId)
        : null;

      let finalImageUrl = existingMaterial?.image_url || '';
      let finalFileUrl = existingMaterial?.file_url || '';

      // -------------------------------------------------------
      // IMAGE UPLOAD
      // -------------------------------------------------------

      if (selectedImage) {
        finalImageUrl = await uploadFile(
          'material-covers',
          'covers',
          selectedImage
        );

        // For Image type, the image itself is the main file
        if (formData.type === 'Image') {
          finalFileUrl = finalImageUrl;
        }
      }

      // -------------------------------------------------------
      // PDF UPLOAD
      // -------------------------------------------------------

      if (formData.type === 'PDF' && attachedDocument) {
        finalFileUrl = await uploadFile(
          'material-files',
          'documents',
          attachedDocument
        );
      }

      // -------------------------------------------------------
      // AUDIO UPLOAD
      // -------------------------------------------------------

      if (formData.type === 'Audio' && attachedAudio) {
        finalFileUrl = await uploadFile(
          'material-files',
          'audio',
          attachedAudio
        );
      }

      // -------------------------------------------------------
      // VIDEO / LINK URL
      // -------------------------------------------------------

      if (formData.type === 'Video' || formData.type === 'Link') {
        finalFileUrl = formData.file_url.trim();
      }

      // -------------------------------------------------------
      // PAYLOAD
      // -------------------------------------------------------

      const normalizedTags = formData.tags
        .split(',')
        .map((tag) => tag.trim())
        .filter(Boolean)
        .filter((tag, index, list) => list.indexOf(tag) === index);

      const payload = {
        title: formData.title.trim(),
        type: formData.type,
        category: formData.category,
        program_component: formData.program_component,
        tags: normalizedTags,
        description: formData.description.trim(),
        image_url: finalImageUrl || null,
        file_url: finalFileUrl || null,
      };

      // -------------------------------------------------------
      // UPDATE
      // -------------------------------------------------------

      if (editingId) {
        const { error } = await supabase
          .from('materials')
          .update(payload)
          .eq('id', editingId);

        if (error) {
          throw error;
        }

        toast({
          title: 'Material Updated',
          description: 'The material has been updated successfully.',
        });
      }

      // -------------------------------------------------------
      // INSERT
      // -------------------------------------------------------

      else {
        const { error } = await supabase
          .from('materials')
          .insert([payload]);

        if (error) {
          throw error;
        }

        toast({
          title: 'Material Published',
          description: 'The new material has been added successfully.',
        });
      }

      setIsDialogOpen(false);

      setFormData({ ...DEFAULT_FORM });
      setSelectedImage(null);
      setAttachedDocument(null);
      setPreviewImageUrl('');
      setEditingId(null);

      await fetchMaterials();
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'Save Error',
        description:
          error?.message || 'Unable to save material.',
      });
    } finally {
      setLoading(false);
    }
  };

  // =========================================================
  // DELETE
  // =========================================================

  const triggerDeleteConfirm = (
    id: number,
    title: string
  ) => {
    setDeleteTargetId(id);
    setDeleteTargetTitle(title);
    setIsDeleteOpen(true);
  };

  const handleExecuteDelete = async () => {
    if (deleteTargetId === null) return;

    try {
      setLoading(true);

      const { error } = await supabase
        .from('materials')
        .delete()
        .eq('id', deleteTargetId);

      if (error) {
        throw error;
      }

      toast({
        title: 'Deleted Successfully',
        description: 'The material was removed successfully.',
      });

      setIsDeleteOpen(false);
      setDeleteTargetId(null);
      setDeleteTargetTitle('');

      await fetchMaterials();
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'Delete Error',
        description:
          error?.message || 'Unable to delete material.',
      });
    } finally {
      setLoading(false);
    }
  };

  // =========================================================
  // PREVIEW
  // =========================================================

  const handlePreview = (item: Material) => {
    setPreviewItem(item);
    setIsPreviewOpen(true);
  };

  // =========================================================
  // DOWNLOAD
  // =========================================================

  const downloadFile = async (
    url: string,
    filename: string
  ) => {
    if (!url) return;

    try {
      const response = await fetch(url);

      if (!response.ok) {
        throw new Error('Download failed.');
      }

      const blob = await response.blob();

      const blobUrl = window.URL.createObjectURL(blob);

      const link = document.createElement('a');

      link.href = blobUrl;
      link.download = filename || 'material';

      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      window.URL.revokeObjectURL(blobUrl);
    } catch {
      // window.open() here would get silently blocked by Chrome's popup
      // blocker — by this point we're inside an async catch block, well
      // after the click that triggered it, so the browser no longer
      // treats it as user-initiated. A synthetic <a> click, same as the
      // success path above, isn't subject to that restriction.
      const link = document.createElement('a');
      link.href = url;
      link.download = filename || 'material';
      link.target = '_blank';
      link.rel = 'noopener noreferrer';

      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    }
  };

  // =========================================================
  // YOUTUBE
  // =========================================================

  const getYouTubeEmbedUrl = (url: string) => {
    if (!url) return '';

    try {
      const parsedUrl = new URL(url);

      // youtube.com/watch?v=
      if (parsedUrl.hostname.includes('youtube.com')) {
        const videoId = parsedUrl.searchParams.get('v');

        if (videoId) {
          return `https://www.youtube.com/embed/${videoId}`;
        }
      }

      // youtu.be/VIDEO_ID
      if (parsedUrl.hostname === 'youtu.be') {
        const videoId = parsedUrl.pathname.substring(1);

        if (videoId) {
          return `https://www.youtube.com/embed/${videoId}`;
        }
      }
    } catch {
      // Invalid URL
    }

    return url;
  };

  // =========================================================
  // FILTER
  // =========================================================

  const allTags = Array.from(
    new Set(materials.flatMap((material) => material.tags || []))
  ).sort((a, b) => a.localeCompare(b));

  const normalizedSearch = searchQuery.trim().toLowerCase();

  const filteredData = materials.filter((material) => {
    const searchableText = [
      material.title,
      material.description || '',
      material.category,
      material.program_component || '',
      ...(material.tags || []),
    ]
      .join(' ')
      .toLowerCase();

    const matchesSearch =
      !normalizedSearch || searchableText.includes(normalizedSearch);
    const matchesCategory =
      selectedCategory === 'All' || material.category === selectedCategory;
    const matchesComponent =
      selectedComponent === 'All' ||
      material.program_component === selectedComponent;
    const matchesTag =
      selectedTag === 'All' || (material.tags || []).includes(selectedTag);

    return matchesSearch && matchesCategory && matchesComponent && matchesTag;
  });

  const articles = filteredData.filter(
    (material) =>
      material.type === 'PDF' ||
      material.file_url
        ?.toLowerCase()
        .split('?')[0]
        .endsWith('.pdf')
  );

  const infographics = filteredData.filter(
    (material) =>
      material.type === 'Image' ||
      /\.(jpg|jpeg|png|webp|gif)(\?.*)?$/i.test(material.file_url || '')
  );

  const videos = filteredData.filter(
    (material) =>
      material.type === 'Video' ||
      material.type === 'Audio' ||
      material.type === 'Link' ||
      material.file_url?.includes('youtube.com') ||
      material.file_url?.includes('youtu.be')
  );

  // =========================================================
  // RENDER
  // =========================================================

  return (
    <div className="space-y-8 p-6 max-w-7xl mx-auto animate-in fade-in duration-700">

      {/* HEADER */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 bg-white p-8 rounded-[2.5rem] border border-slate-100 shadow-sm">

        <div className="space-y-1">
          <h1 className="text-4xl font-black text-slate-900 tracking-tighter uppercase">
            IEC{' '}
            <span className="text-indigo-600">
              Materials
            </span>
          </h1>

          <p className="text-slate-500 font-medium flex items-center gap-2">
            <Calendar className="w-4 h-4 text-indigo-400" />
            Guidance Resources Library
          </p>
        </div>

        <div className="flex flex-col sm:flex-row gap-3 w-full md:w-auto items-center">

          <div className="relative w-full sm:w-64">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />

            <Input
              placeholder="Search materials..."
              value={searchQuery}
              onChange={(event) =>
                setSearchQuery(event.target.value)
              }
              className="pl-11 h-12 bg-slate-50 border-none rounded-2xl"
            />
          </div>

          <Button
            onClick={() => handleOpenDialog()}
            className="h-12 w-full sm:w-auto px-6 rounded-2xl font-black bg-indigo-600 hover:bg-indigo-700 text-white uppercase text-[10px] tracking-wider"
          >
            <Plus className="w-4 h-4 mr-2" />
            Upload Material
          </Button>
        </div>
      </div>

      {/* FILTERS */}
      <Card className="p-5 bg-white border-none shadow-sm rounded-[2rem]">
        <div className="flex items-center gap-2 mb-4">
          <Filter className="w-4 h-4 text-indigo-600" />
          <h2 className="text-xs font-black uppercase tracking-widest text-slate-700">
            Filter IEC Materials
          </h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <select value={selectedCategory} onChange={(event) => setSelectedCategory(event.target.value)} className="select-field">
            <option value="All">All IEC Categories</option>
            {IEC_CATEGORIES.map((category) => (
              <option key={category} value={category}>{category}</option>
            ))}
          </select>

          <select value={selectedComponent} onChange={(event) => setSelectedComponent(event.target.value)} className="select-field">
            <option value="All">All Program Components</option>
            {PROGRAM_COMPONENTS.map((component) => (
              <option key={component} value={component}>{component}</option>
            ))}
          </select>

          <select value={selectedTag} onChange={(event) => setSelectedTag(event.target.value)} className="select-field">
            <option value="All">All Tags</option>
            {allTags.map((tag) => (
              <option key={tag} value={tag}>{tag}</option>
            ))}
          </select>
        </div>
      </Card>

      {/* TABS */}

      <Tabs
        value={activeTab}
        onValueChange={setActiveTab}
        className="w-full"
      >
        <TabsList className="bg-slate-100/50 p-1.5 rounded-2xl mb-8 border border-slate-100">

          <TabsTrigger
            value="articles"
            className="px-4 sm:px-8 rounded-xl font-bold data-[state=active]:bg-white data-[state=active]:text-indigo-600 uppercase text-xs"
          >
            Articles
          </TabsTrigger>

          <TabsTrigger
            value="infographics"
            className="px-4 sm:px-8 rounded-xl font-bold data-[state=active]:bg-white data-[state=active]:text-indigo-600 uppercase text-xs"
          >
            Infographics
          </TabsTrigger>

          <TabsTrigger
            value="videos"
            className="px-4 sm:px-8 rounded-xl font-bold data-[state=active]:bg-white data-[state=active]:text-indigo-600 uppercase text-xs"
          >
            Video / Audio / Links
          </TabsTrigger>

        </TabsList>

        {loading ? (
          <div className="h-64 flex flex-col items-center justify-center gap-4">
            <Loader2 className="h-10 w-10 animate-spin text-indigo-600" />

            <p className="text-slate-400 font-bold uppercase text-xs tracking-widest">
              Loading Materials
            </p>
          </div>
        ) : (
          <>
            {/* =====================================================
                ARTICLES
            ====================================================== */}

            <TabsContent
              value="articles"
              className="grid grid-cols-1 md:grid-cols-2 gap-6 outline-none"
            >
              {articles.length > 0 ? (
                articles.map((item) => (
                  <Card
                    key={item.id}
                    className="p-6 bg-white border-none shadow-sm rounded-[2rem] hover:shadow-xl transition-all group relative"
                  >
                    <MaterialActions
                      onEdit={() =>
                        handleOpenDialog(item)
                      }
                      onDelete={() =>
                        triggerDeleteConfirm(
                          item.id,
                          item.title
                        )
                      }
                    />

                    <div className="flex gap-5">

                      <div className="w-16 h-16 bg-slate-50 rounded-2xl flex items-center justify-center flex-shrink-0 group-hover:bg-indigo-50">
                        <FileText className="w-8 h-8 text-indigo-600" />
                      </div>

                      <div className="flex-1 min-w-0">

                        <MaterialCategory
                          category={item.category}
                        />
                        <MaterialMeta item={item} />

                        <h3 className="text-xl font-black text-slate-800 truncate uppercase mt-1">
                          {item.title}
                        </h3>

                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-4">
                          {item.description
                            ? item.description.substring(
                                0,
                                60
                              ) +
                              (item.description.length >
                              60
                                ? '...'
                                : '')
                            : 'Handout Document'}
                        </p>

                        <div className="flex gap-2">

                          <Button
                            onClick={() =>
                              handlePreview(item)
                            }
                            className="flex-1 h-11 bg-slate-900 hover:bg-indigo-600 rounded-xl font-black uppercase text-xs text-white"
                          >
                            <Eye className="w-3 h-3 mr-2" />
                            Preview
                          </Button>

                          {item.file_url && (
                            <Button
                              onClick={() =>
                                downloadFile(
                                  item.file_url!,
                                  item.title
                                )
                              }
                              variant="outline"
                              className="flex-1 h-11 border-slate-200 rounded-xl font-black uppercase text-xs"
                            >
                              <Download className="w-3 h-3 mr-2" />
                              Save
                            </Button>
                          )}

                        </div>
                      </div>
                    </div>
                  </Card>
                ))
              ) : (
                <EmptyState message="No articles found" />
              )}
            </TabsContent>

            {/* =====================================================
                INFOGRAPHICS
            ====================================================== */}

            <TabsContent
              value="infographics"
              className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 outline-none"
            >
              {infographics.length > 0 ? (
                infographics.map((item) => {

                  const imageUrl =
                    item.file_url ||
                    item.image_url ||
                    '';

                  return (
                    <Card
                      key={item.id}
                      className="overflow-hidden bg-white border-none shadow-sm rounded-[2.5rem] group hover:shadow-2xl transition-all duration-500 relative"
                    >

                      <MaterialActions
                        onEdit={() =>
                          handleOpenDialog(item)
                        }
                        onDelete={() =>
                          triggerDeleteConfirm(
                            item.id,
                            item.title
                          )
                        }
                      />

                      <div className="relative h-64 bg-slate-100 overflow-hidden">

                        {imageUrl ? (
                          <img
                            src={imageUrl}
                            alt={item.title}
                            className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-700"
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center">
                            <HardDrive className="w-12 h-12 text-slate-300" />
                          </div>
                        )}

                        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">

                          <Button
                            onClick={() =>
                              handlePreview(item)
                            }
                            className="rounded-full bg-white text-slate-900 h-12 w-12 p-0 shadow-xl"
                          >
                            <Maximize2 className="w-5 h-5" />
                          </Button>

                        </div>
                      </div>

                      <div className="p-6">

                        <MaterialCategory
                          category={item.category}
                        />
                        <MaterialMeta item={item} />

                        <h3 className="font-black text-slate-800 truncate uppercase mt-1 mb-4">
                          {item.title}
                        </h3>

                        {imageUrl && (
                          <Button
                            onClick={() =>
                              downloadFile(
                                imageUrl,
                                item.title
                              )
                            }
                            className="w-full h-12 bg-slate-900 hover:bg-indigo-600 rounded-2xl font-black uppercase text-xs text-white"
                          >
                            <Download className="w-4 h-4 mr-2" />
                            Download Image
                          </Button>
                        )}

                      </div>
                    </Card>
                  );
                })
              ) : (
                <EmptyState message="No infographics found" />
              )}
            </TabsContent>

            {/* =====================================================
                VIDEOS
            ====================================================== */}

            <TabsContent
              value="videos"
              className="grid grid-cols-1 md:grid-cols-2 gap-6 outline-none"
            >
              {videos.length > 0 ? (
                videos.map((item) => (
                  <Card
                    key={item.id}
                    className="p-8 bg-white border-none shadow-sm rounded-[2.5rem] group relative"
                  >

                    <MaterialActions
                      onEdit={() =>
                        handleOpenDialog(item)
                      }
                      onDelete={() =>
                        triggerDeleteConfirm(
                          item.id,
                          item.title
                        )
                      }
                    />

                    <div className="flex items-center gap-6">

                      <div className={`w-20 h-20 rounded-3xl flex items-center justify-center shrink-0 ${
                        item.type === 'Audio'
                          ? 'bg-purple-50'
                          : item.type === 'Link'
                          ? 'bg-indigo-50'
                          : 'bg-red-50'
                      }`}>
                        {item.type === 'Audio' ? (
                          <Music className="w-10 h-10 text-purple-600" />
                        ) : item.type === 'Link' ? (
                          <LinkIcon className="w-10 h-10 text-indigo-600" />
                        ) : (
                          <Youtube className="w-10 h-10 text-red-600" />
                        )}
                      </div>

                      <div className="flex-1 min-w-0">

                        <MaterialCategory
                          category={item.category}
                        />
                        <MaterialMeta item={item} />

                        <h3 className="text-xl font-black text-slate-800 uppercase mt-1 mb-4 truncate">
                          {item.title}
                        </h3>

                        <Button
                          onClick={() =>
                            handlePreview(item)
                          }
                          className={`h-12 px-8 rounded-2xl font-black uppercase text-xs text-white ${
                            item.type === 'Audio'
                              ? 'bg-purple-600 hover:bg-purple-700'
                              : item.type === 'Link'
                              ? 'bg-indigo-600 hover:bg-indigo-700'
                              : 'bg-red-600 hover:bg-red-700'
                          }`}
                        >
                          {item.type === 'Audio'
                            ? 'Play Audio'
                            : item.type === 'Link'
                            ? 'Open Link'
                            : 'Watch Now'}
                        </Button>

                      </div>
                    </div>
                  </Card>
                ))
              ) : (
                <EmptyState message="No videos found" />
              )}
            </TabsContent>
          </>
        )}
      </Tabs>

      {/* =========================================================
          ADD / EDIT DIALOG
      ========================================================== */}

      <Dialog
        open={isDialogOpen}
        onOpenChange={setIsDialogOpen}
      >
        <DialogContent className="max-w-2xl bg-white rounded-3xl p-6 md:p-8 max-h-[92vh] overflow-y-auto border-none shadow-2xl">

          <DialogHeader>
            <DialogTitle className="text-2xl font-black uppercase tracking-tight text-slate-900">
              {editingId ? 'Edit' : 'Upload'}{' '}
              <span className="text-indigo-600">
                Guidance Material
              </span>
            </DialogTitle>
          </DialogHeader>

          <div className="grid gap-5 mt-4">

            {/* TITLE / TYPE */}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">

              <div className="space-y-4">

                <div className="space-y-1.5">
                  <Label className="field-label">
                    Resource Media Format
                  </Label>

                  <select
                    value={formData.type}
                    onChange={(event) => {
                      const type =
                        event.target.value as MaterialType;

                      setFormData((previous) => ({
                        ...previous,
                        type,
                        file_url:
                          type === 'Video' || type === 'Link'
                            ? previous.file_url
                            : '',
                      }));

                      setSelectedImage(null);
                      setAttachedDocument(null);
                      setAttachedAudio(null);
                    }}
                    className="select-field"
                  >
                    <option value="PDF">
                      Article / Document (PDF)
                    </option>

                    <option value="Image">
                      Infographic Graphic Image
                    </option>

                    <option value="Video">
                      Video Streaming Link
                    </option>

                    <option value="Audio">
                      Audio File
                    </option>

                    <option value="Link">
                      External Link
                    </option>
                  </select>
                </div>

                <div className="space-y-1.5">

                  <Label className="field-label">
                    Material Title
                  </Label>

                  <Input
                    value={formData.title}
                    onChange={(event) =>
                      setFormData({
                        ...formData,
                        title: event.target.value,
                      })
                    }
                    className="rounded-xl bg-slate-50 border-none h-12 font-bold px-4 text-slate-700"
                    placeholder="e.g., Guide to Stress Management"
                  />

                </div>

              </div>

              <div className="space-y-1.5">

                <Label className="field-label">
                  Short Description
                </Label>

                <Textarea
                  value={formData.description}
                  onChange={(event) =>
                    setFormData({
                      ...formData,
                      description:
                        event.target.value,
                    })
                  }
                  placeholder="Outline context details/notes here..."
                  className="h-32 md:h-[114px] rounded-xl bg-slate-50 border-none p-4 font-medium text-slate-600 text-xs resize-none"
                />

              </div>
            </div>

            {/* CATEGORY / FILE */}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">

              <div className="space-y-1.5">
                <Label className="field-label">
                  IEC Category
                </Label>

                <select
                  value={formData.category}
                  onChange={(event) =>
                    setFormData({ ...formData, category: event.target.value })
                  }
                  className="select-field"
                >
                  {IEC_CATEGORIES.map((category) => (
                    <option key={category} value={category}>
                      {category}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-1.5">
                <Label className="field-label">
                  Program Component
                </Label>

                <select
                  value={formData.program_component}
                  onChange={(event) =>
                    setFormData({ ...formData, program_component: event.target.value })
                  }
                  className="select-field"
                >
                  {PROGRAM_COMPONENTS.map((component) => (
                    <option key={component} value={component}>
                      {component}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-1.5 sm:col-span-2">
                <Label className="field-label flex items-center gap-1">
                  <Tag className="w-3 h-3" />
                  Tags
                </Label>
                <Input
                  value={formData.tags}
                  onChange={(event) =>
                    setFormData({ ...formData, tags: event.target.value })
                  }
                  className="rounded-xl bg-slate-50 border-none h-12 font-bold px-4 text-slate-700"
                  placeholder="e.g. study skills, academic success, learning strategies"
                />
                <p className="text-[10px] text-slate-400 font-medium">
                  Separate multiple tags with commas.
                </p>
              </div>

              {/* PDF */}

              {formData.type === 'PDF' && (
                <div className="space-y-1.5">

                  <Label className="field-label">
                    Document Attachment (.pdf)
                  </Label>

                  <div
                    onClick={() =>
                      documentInputRef.current?.click()
                    }
                    className="h-12 bg-slate-50 hover:bg-slate-100 rounded-xl flex items-center px-4 cursor-pointer text-slate-600 text-xs"
                  >

                    <FileText className="w-4 h-4 text-indigo-500 mr-2 shrink-0" />

                    <span className="truncate flex-1 font-bold">
                      {attachedDocument
                        ? attachedDocument.name
                        : editingId
                        ? 'Replace PDF Document...'
                        : 'Choose PDF Document...'}
                    </span>

                    <input
                      type="file"
                      ref={documentInputRef}
                      className="hidden"
                      accept=".pdf,application/pdf"
                      onChange={
                        handleDocumentSelect
                      }
                    />

                  </div>
                </div>
              )}

              {/* IMAGE */}

              {formData.type === 'Image' && (
                <div className="space-y-1.5">

                  <Label className="field-label">
                    Infographic File Asset
                  </Label>

                  <div
                    onClick={() =>
                      imageInputRef.current?.click()
                    }
                    className="h-12 bg-slate-50 hover:bg-slate-100 rounded-xl flex items-center px-4 cursor-pointer text-slate-600 text-xs"
                  >

                    <Camera className="w-4 h-4 text-indigo-500 mr-2 shrink-0" />

                    <span className="truncate flex-1 font-bold">
                      {selectedImage
                        ? selectedImage.name
                        : editingId
                        ? 'Replace Graphic Image...'
                        : 'Choose Graphic Image...'}
                    </span>

                    <input
                      type="file"
                      ref={imageInputRef}
                      className="hidden"
                      accept="image/*"
                      onChange={(event) =>
                        handleImageSelect(
                          event,
                          true
                        )
                      }
                    />

                  </div>
                </div>
              )}

              {/* VIDEO */}

              {formData.type === 'Video' && (
                <div className="space-y-1.5">

                  <Label className="field-label text-red-500">
                    YouTube Streaming URL
                  </Label>

                  <Input
                    value={formData.file_url}
                    onChange={(event) =>
                      setFormData({
                        ...formData,
                        file_url:
                          event.target.value,
                      })
                    }
                    className="rounded-xl bg-slate-50 border-none h-12 font-bold px-4 text-slate-700"
                    placeholder="https://www.youtube.com/watch?v=..."
                  />

                </div>
              )}

              {/* AUDIO */}

              {formData.type === 'Audio' && (
                <div className="space-y-1.5">

                  <Label className="field-label">
                    Audio File Attachment
                  </Label>

                  <div
                    onClick={() =>
                      audioInputRef.current?.click()
                    }
                    className="h-12 bg-slate-50 hover:bg-slate-100 rounded-xl flex items-center px-4 cursor-pointer text-slate-600 text-xs"
                  >

                    <FileText className="w-4 h-4 text-indigo-500 mr-2 shrink-0" />

                    <span className="truncate flex-1 font-bold">
                      {attachedAudio
                        ? attachedAudio.name
                        : editingId
                        ? 'Replace Audio File...'
                        : 'Choose Audio File...'}
                    </span>

                    <input
                      type="file"
                      ref={audioInputRef}
                      className="hidden"
                      accept="audio/*"
                      onChange={
                        handleAudioSelect
                      }
                    />

                  </div>
                </div>
              )}

              {/* LINK */}

              {formData.type === 'Link' && (
                <div className="space-y-1.5">

                  <Label className="field-label">
                    External Resource URL
                  </Label>

                  <Input
                    value={formData.file_url}
                    onChange={(event) =>
                      setFormData({
                        ...formData,
                        file_url:
                          event.target.value,
                      })
                    }
                    className="rounded-xl bg-slate-50 border-none h-12 font-bold px-4 text-slate-700"
                    placeholder="https://..."
                  />

                </div>
              )}
            </div>

            {/* OPTIONAL COVER */}

            {formData.type !== 'Image' && (
              <div className="space-y-1.5">

                <Label className="field-label">
                  Display Banner Image Cover
                  (Optional)
                </Label>

                <div
                  onClick={() =>
                    imageInputRef.current?.click()
                  }
                  className="h-12 bg-slate-50 hover:bg-slate-100 rounded-xl flex items-center px-4 cursor-pointer text-slate-600 text-xs"
                >

                  <Camera className="w-4 h-4 text-slate-400 mr-2" />

                  <span className="truncate flex-1 font-medium">
                    {selectedImage
                      ? selectedImage.name
                      : 'Upload visual thumbnail cover...'}
                  </span>

                  <input
                    type="file"
                    ref={imageInputRef}
                    className="hidden"
                    accept="image/*"
                    onChange={(event) =>
                      handleImageSelect(event)
                    }
                  />

                </div>

                {previewImageUrl && (
                  <div className="mt-3 rounded-xl overflow-hidden bg-slate-100 h-32">
                    <img
                      src={previewImageUrl}
                      alt="Cover preview"
                      className="w-full h-full object-cover"
                    />
                  </div>
                )}

              </div>
            )}

            {/* SAVE */}

            <div className="pt-2">

              <Button
                onClick={handleSave}
                disabled={loading}
                className="w-full h-14 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-black uppercase text-xs shadow-md"
              >
                {loading ? (
                  <Loader2 className="animate-spin h-5 w-5" />
                ) : editingId ? (
                  'Save & Sync Resource'
                ) : (
                  'Publish Asset Item'
                )}
              </Button>

            </div>

          </div>
        </DialogContent>
      </Dialog>

      {/* =========================================================
          PREVIEW
      ========================================================== */}

      <Dialog
        open={isPreviewOpen}
        onOpenChange={setIsPreviewOpen}
      >
        <DialogContent className="max-w-5xl w-[95vw] h-[90vh] p-0 overflow-hidden bg-slate-950 border-none rounded-[2rem] shadow-2xl flex flex-col">

          <DialogHeader className="p-6 bg-white border-b border-slate-100 shrink-0">

            <DialogTitle className="font-black uppercase tracking-tighter text-xl text-slate-900">
              {previewItem?.title}
            </DialogTitle>

            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-[0.2em]">
              Material Preview Mode
            </p>

          </DialogHeader>

          <div className="flex-1 w-full bg-slate-900 flex items-center justify-center overflow-hidden">

            {/* VIDEO */}

            {previewItem &&
            previewItem.type === 'Video' ? (
              <iframe
                src={getYouTubeEmbedUrl(
                  previewItem.file_url || ''
                )}
                className="w-full aspect-video max-w-4xl rounded-2xl shadow-2xl border-none"
                allowFullScreen
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                title={previewItem.title}
              />
            ) : previewItem &&
              previewItem.type === 'PDF' &&
              previewItem.file_url ? (
              <Suspense
                fallback={
                  <div className="flex flex-col items-center justify-center gap-3">
                    <Loader2 className="w-8 h-8 animate-spin text-indigo-400" />
                    <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">
                      Loading PDF...
                    </p>
                  </div>
                }
              >
                <PdfPreview url={previewItem.file_url} />
              </Suspense>
            ) : previewItem &&
              previewItem.type === 'Image' &&
              (previewItem.file_url ||
                previewItem.image_url) ? (
              /* IMAGE */

              <div className="p-4 w-full h-full flex items-center justify-center">
                <img
                  src={
                    previewItem.file_url ||
                    previewItem.image_url ||
                    ''
                  }
                  className="max-w-full max-h-full object-contain rounded-lg shadow-2xl"
                  alt={previewItem.title}
                />
              </div>
            ) : previewItem &&
              previewItem.type === 'Audio' &&
              previewItem.file_url ? (
              /* AUDIO */

              <div className="p-8 w-full max-w-xl flex flex-col items-center gap-6">
                <div className="w-24 h-24 rounded-3xl bg-purple-500/10 flex items-center justify-center">
                  <Music className="w-12 h-12 text-purple-400" />
                </div>
                <audio
                  src={previewItem.file_url}
                  controls
                  className="w-full"
                />
              </div>
            ) : previewItem &&
              previewItem.type === 'Link' &&
              previewItem.file_url ? (
              /* LINK */

              <div className="p-8 w-full max-w-xl flex flex-col items-center gap-6 text-center">
                <div className="w-24 h-24 rounded-3xl bg-indigo-500/10 flex items-center justify-center">
                  <LinkIcon className="w-12 h-12 text-indigo-400" />
                </div>
                <p className="text-slate-300 text-sm break-all">
                  {previewItem.file_url}
                </p>
                <a
                  href={previewItem.file_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center justify-center h-12 px-8 rounded-2xl bg-indigo-600 hover:bg-indigo-700 text-white font-black uppercase text-xs"
                >
                  Open in New Tab
                </a>
              </div>
            ) : (
              <div className="text-center">

                <HardDrive className="w-16 h-16 text-slate-700 mx-auto" />

                <p className="font-bold text-slate-500 mt-4 uppercase text-xs">
                  Format not supported for preview
                </p>

              </div>
            )}

          </div>

          <div className="p-4 bg-white border-t border-slate-100 flex justify-end gap-3 shrink-0">

            <Button
              variant="ghost"
              onClick={() =>
                setIsPreviewOpen(false)
              }
              className="rounded-xl font-bold uppercase text-[10px]"
            >
              Close
            </Button>

            {previewItem &&
              previewItem.type !== 'Video' &&
              previewItem.type !== 'Link' &&
              previewItem.file_url && (
                <Button
                  onClick={() =>
                    downloadFile(
                      previewItem.file_url!,
                      previewItem.title
                    )
                  }
                  className="bg-indigo-600 rounded-xl font-black uppercase text-[10px] px-6 text-white"
                >
                  Download Resource
                </Button>
              )}

          </div>
        </DialogContent>
      </Dialog>

      {/* =========================================================
          DELETE
      ========================================================== */}

      <Dialog
        open={isDeleteOpen}
        onOpenChange={setIsDeleteOpen}
      >
        <DialogContent className="max-w-md bg-white rounded-[2rem] p-6 border-none shadow-2xl text-center">

          <div className="mx-auto w-14 h-14 bg-rose-50 text-rose-500 rounded-full flex items-center justify-center mb-4">
            <AlertCircle className="w-8 h-8" />
          </div>

          <DialogHeader>

            <DialogTitle className="text-xl font-black text-slate-900 uppercase tracking-tight text-center">
              Delete Resource?
            </DialogTitle>

          </DialogHeader>

          <div className="mt-3 text-slate-500 text-xs font-medium leading-relaxed px-2">

            You are about to permanently delete{' '}

            <span className="font-bold text-slate-800 uppercase">
              "{deleteTargetTitle}"
            </span>

            . This action cannot be undone.

          </div>

          <div className="grid grid-cols-2 gap-3 mt-6">

            <Button
              variant="ghost"
              onClick={() =>
                setIsDeleteOpen(false)
              }
              className="h-12 rounded-xl font-black uppercase text-[10px] text-slate-500 bg-slate-50"
            >
              Cancel
            </Button>

            <Button
              onClick={handleExecuteDelete}
              disabled={loading}
              className="h-12 rounded-xl font-black uppercase text-[10px] bg-rose-600 hover:bg-rose-700 text-white"
            >
              {loading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                'Confirm Deletion'
              )}
            </Button>

          </div>

        </DialogContent>
      </Dialog>
    </div>
  );
}

// =============================================================
// SMALL COMPONENTS
// =============================================================

function MaterialActions({
  onEdit,
  onDelete,
}: {
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    // opacity-0 + group-hover only reveals these on devices with a real
    // :hover (a mouse) — touch devices have no equivalent gesture, so an
    // admin on mobile/tablet could never actually reach Edit/Delete here.
    // Always visible below md; hover-reveal only kicks in on larger
    // screens where a pointer is the norm.
    <div className="absolute top-4 right-4 flex gap-1 z-10 opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity">

      <Button
        size="icon"
        variant="secondary"
        className="h-8 w-8 rounded-xl bg-white shadow-sm"
        onClick={onEdit}
        aria-label="Edit material"
      >
        <Edit className="w-3.5 h-3.5 text-slate-600" />
      </Button>

      <Button
        size="icon"
        variant="destructive"
        className="h-8 w-8 rounded-xl shadow-sm"
        onClick={onDelete}
        aria-label="Delete material"
      >
        <Trash2 className="w-3.5 h-3.5" />
      </Button>

    </div>
  );
}

function MaterialCategory({
  category,
}: {
  category?: string | null;
}) {
  return (
    <span className="px-2 py-0.5 bg-indigo-50 text-indigo-600 font-black uppercase text-[8px] tracking-wider rounded">
      {category || 'General Guidance'}
    </span>
  );
}

function MaterialMeta({ item }: { item: Material }) {
  return (
    <div className="mt-2 space-y-1.5">
      {item.program_component && (
        <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">
          {item.program_component}
        </p>
      )}

      {item.tags && item.tags.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {item.tags.slice(0, 4).map((tag) => (
            <span key={tag} className="px-2 py-0.5 rounded-full bg-slate-100 text-slate-500 text-[8px] font-bold">
              #{tag}
            </span>
          ))}
          {item.tags.length > 4 && (
            <span className="text-[8px] font-bold text-slate-400">
              +{item.tags.length - 4} more
            </span>
          )}
        </div>
      )}
    </div>
  );
}

function EmptyState({
  message,
}: {
  message: string;
}) {
  return (
    <div className="col-span-full py-32 text-center bg-slate-50/50 rounded-[3rem] border-4 border-dashed border-slate-100">

      <HardDrive className="w-16 h-16 text-slate-200 mx-auto mb-4" />

      <p className="text-slate-400 font-black uppercase text-xl tracking-tighter">
        {message}
      </p>

    </div>
  );
}