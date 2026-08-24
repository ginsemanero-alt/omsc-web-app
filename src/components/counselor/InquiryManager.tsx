import React, { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "../../lib/supabase";

import { Card } from "../../components/ui/card";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import { Badge } from "../../components/ui/badge";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../../components/ui/select";

import {
  Bell,
  Megaphone,
  Plus,
  Search,
  Edit3,
  Trash2,
  Eye,
  EyeOff,
  Save,
  Loader2,
  CalendarDays,
  Users,
  BookOpen,
  AlertTriangle,
  CheckCircle2,
  X,
  Send,
  FileText,
  GraduationCap,
  Building2,
  ShieldCheck,
} from "lucide-react";

import { useToast } from "../../hooks/use-toast";

type AnnouncementStatus = "draft" | "published";

type AnnouncementPriority = "normal" | "important" | "urgent";

type AnnouncementAudience =
  | "all"
  | "program"
  | "year_level"
  | "campus";

interface Announcement {
  id: string;
  title: string;
  content: string;
  category: string;
  priority: AnnouncementPriority;
  audience: AnnouncementAudience;
  target_value: string | null;
  status: AnnouncementStatus;
  publish_at: string | null;
  expires_at: string | null;
  created_at: string;
  updated_at: string;
}

interface AnnouncementForm {
  title: string;
  content: string;
  category: string;
  priority: AnnouncementPriority;
  audience: AnnouncementAudience;
  targetValue: string;
  publishAt: string;
  expiresAt: string;
  status: AnnouncementStatus;
}

const INITIAL_FORM: AnnouncementForm = {
  title: "",
  content: "",
  category: "General",
  priority: "normal",
  audience: "all",
  targetValue: "",
  publishAt: "",
  expiresAt: "",
  status: "draft",
};

const CATEGORIES = [
  "General",
  "Guidance Program",
  "IEC Material",
  "Awareness Campaign",
  "Anti-Bullying",
  "Seminar",
  "Mental Health Awareness",
  "Career Guidance",
  "Academic Guidance",
  "Personal-Social Guidance",
];

const PROGRAMS = [
  "BSIT",
  "BSBA",
  "BSED",
  "BEED",
  "BSHM",
  "BSAgri",
];

const YEAR_LEVELS = [
  { value: "1", label: "1st Year" },
  { value: "2", label: "2nd Year" },
  { value: "3", label: "3rd Year" },
  { value: "4", label: "4th Year" },
];

const CAMPUSES = [
  "San Jose Campus",
  "Labangan Campus",
  "Mamburao Campus",
  "Sablayan Campus",
  "Murtha Campus",
  "Extension Campus",
];

function formatDate(date: string | null) {
  if (!date) return "No date";

  return new Date(date).toLocaleDateString("en-PH", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function formatDateTime(date: string | null) {
  if (!date) return "Not scheduled";

  return new Date(date).toLocaleString("en-PH", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function getPriorityClasses(priority: AnnouncementPriority) {
  switch (priority) {
    case "urgent":
      return "bg-red-100 text-red-700 border-red-200";

    case "important":
      return "bg-amber-100 text-amber-700 border-amber-200";

    default:
      return "bg-slate-100 text-slate-600 border-slate-200";
  }
}

function getCategoryClasses(category: string) {
  if (category === "Anti-Bullying") {
    return "bg-rose-50 text-rose-600";
  }

  if (category === "Guidance Program") {
    return "bg-indigo-50 text-indigo-600";
  }

  if (category === "IEC Material") {
    return "bg-purple-50 text-purple-600";
  }

  if (category === "Seminar") {
    return "bg-blue-50 text-blue-600";
  }

  return "bg-slate-50 text-slate-600";
}

export default function AnnouncementMaker() {
  const { toast } = useToast();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [announcements, setAnnouncements] = useState<Announcement[]>([]);

  const [editingId, setEditingId] = useState<string | null>(null);

  const [form, setForm] = useState<AnnouncementForm>(INITIAL_FORM);

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [categoryFilter, setCategoryFilter] = useState("all");

  const [previewOpen, setPreviewOpen] = useState(false);

  const updateForm = <K extends keyof AnnouncementForm>(
    key: K,
    value: AnnouncementForm[K]
  ) => {
    setForm((previous) => ({
      ...previous,
      [key]: value,
    }));
  };

  const fetchAnnouncements = useCallback(async () => {
    try {
      setLoading(true);

      const { data, error } = await supabase
        .from("announcements")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) throw error;

      setAnnouncements((data || []) as Announcement[]);
    } catch (error: any) {
      console.error("Announcement loading error:", error);

      toast({
        variant: "destructive",
        title: "Unable to Load Announcements",
        description: error?.message || "Something went wrong.",
      });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    fetchAnnouncements();
  }, [fetchAnnouncements]);

  const resetForm = () => {
    setForm(INITIAL_FORM);
    setEditingId(null);
    setPreviewOpen(false);
  };

  const handleAudienceChange = (value: AnnouncementAudience) => {
    updateForm("audience", value);

    if (value === "all") {
      updateForm("targetValue", "");
    }
  };

  const validateForm = () => {
    if (!form.title.trim()) {
      toast({
        variant: "destructive",
        title: "Title Required",
        description: "Please provide an announcement title.",
      });
      return false;
    }

    if (!form.content.trim()) {
      toast({
        variant: "destructive",
        title: "Content Required",
        description: "Please provide announcement content.",
      });
      return false;
    }

    if (form.audience !== "all" && !form.targetValue) {
      toast({
        variant: "destructive",
        title: "Target Audience Required",
        description: "Please select the target audience.",
      });
      return false;
    }

    if (
      form.publishAt &&
      form.expiresAt &&
      new Date(form.expiresAt) <= new Date(form.publishAt)
    ) {
      toast({
        variant: "destructive",
        title: "Invalid Schedule",
        description: "Expiration date must be later than publication date.",
      });
      return false;
    }

    return true;
  };

  const handleSave = async (status?: AnnouncementStatus) => {
    if (!validateForm()) return;

    setSaving(true);

    try {
      const finalStatus = status || form.status;

      const payload = {
        title: form.title.trim(),
        content: form.content.trim(),
        category: form.category,
        priority: form.priority,
        audience: form.audience,
        target_value:
          form.audience === "all" ? null : form.targetValue || null,
        status: finalStatus,
        publish_at: form.publishAt
          ? new Date(form.publishAt).toISOString()
          : finalStatus === "published"
            ? new Date().toISOString()
            : null,
        expires_at: form.expiresAt
          ? new Date(form.expiresAt).toISOString()
          : null,
        updated_at: new Date().toISOString(),
      };

      if (editingId) {
        const { error } = await supabase
          .from("announcements")
          .update(payload)
          .eq("id", editingId);

        if (error) throw error;

        toast({
          title:
            finalStatus === "published"
              ? "ANNOUNCEMENT PUBLISHED"
              : "DRAFT UPDATED",
          description:
            finalStatus === "published"
              ? "The announcement is now available to the selected audience."
              : "Your announcement draft has been updated.",
          className: "bg-emerald-600 text-white font-bold rounded-2xl",
        });
      } else {
        const { error } = await supabase
          .from("announcements")
          .insert(payload);

        if (error) throw error;

        toast({
          title:
            finalStatus === "published"
              ? "ANNOUNCEMENT PUBLISHED"
              : "DRAFT SAVED",
          description:
            finalStatus === "published"
              ? "The announcement has been published successfully."
              : "The announcement was saved as a draft.",
          className: "bg-emerald-600 text-white font-bold rounded-2xl",
        });
      }

      resetForm();
      await fetchAnnouncements();
    } catch (error: any) {
      console.error("Save announcement error:", error);

      toast({
        variant: "destructive",
        title: "Save Failed",
        description: error?.message || "Unable to save announcement.",
      });
    } finally {
      setSaving(false);
    }
  };

  const handleEdit = (announcement: Announcement) => {
    setEditingId(announcement.id);

    const toLocalDateTime = (date: string | null) => {
      if (!date) return "";

      const parsed = new Date(date);

      const year = parsed.getFullYear();
      const month = String(parsed.getMonth() + 1).padStart(2, "0");
      const day = String(parsed.getDate()).padStart(2, "0");
      const hours = String(parsed.getHours()).padStart(2, "0");
      const minutes = String(parsed.getMinutes()).padStart(2, "0");

      return `${year}-${month}-${day}T${hours}:${minutes}`;
    };

    setForm({
      title: announcement.title,
      content: announcement.content,
      category: announcement.category,
      priority: announcement.priority,
      audience: announcement.audience,
      targetValue: announcement.target_value || "",
      publishAt: toLocalDateTime(announcement.publish_at),
      expiresAt: toLocalDateTime(announcement.expires_at),
      status: announcement.status,
    });

    window.scrollTo({
      top: 0,
      behavior: "smooth",
    });
  };

  const handleDelete = async (id: string) => {
    const confirmed = window.confirm(
      "Are you sure you want to delete this announcement?"
    );

    if (!confirmed) return;

    try {
      const { error } = await supabase
        .from("announcements")
        .delete()
        .eq("id", id);

      if (error) throw error;

      toast({
        title: "ANNOUNCEMENT DELETED",
        description: "The announcement has been permanently removed.",
      });

      if (editingId === id) {
        resetForm();
      }

      await fetchAnnouncements();
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Delete Failed",
        description: error?.message || "Unable to delete announcement.",
      });
    }
  };

  const togglePublish = async (announcement: Announcement) => {
    const nextStatus: AnnouncementStatus =
      announcement.status === "published" ? "draft" : "published";

    try {
      const { error } = await supabase
        .from("announcements")
        .update({
          status: nextStatus,
          publish_at:
            nextStatus === "published"
              ? announcement.publish_at || new Date().toISOString()
              : announcement.publish_at,
          updated_at: new Date().toISOString(),
        })
        .eq("id", announcement.id);

      if (error) throw error;

      toast({
        title:
          nextStatus === "published"
            ? "ANNOUNCEMENT PUBLISHED"
            : "ANNOUNCEMENT UNPUBLISHED",
        description:
          nextStatus === "published"
            ? "The announcement is now visible to students."
            : "The announcement has been moved back to draft.",
      });

      await fetchAnnouncements();
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Status Update Failed",
        description: error?.message || "Unable to update announcement.",
      });
    }
  };

  const filteredAnnouncements = useMemo(() => {
    return announcements.filter((announcement) => {
      const searchText = search.toLowerCase();

      const matchesSearch =
        !searchText ||
        announcement.title.toLowerCase().includes(searchText) ||
        announcement.content.toLowerCase().includes(searchText) ||
        announcement.category.toLowerCase().includes(searchText);

      const matchesStatus =
        statusFilter === "all" ||
        announcement.status === statusFilter;

      const matchesCategory =
        categoryFilter === "all" ||
        announcement.category === categoryFilter;

      return matchesSearch && matchesStatus && matchesCategory;
    });
  }, [announcements, search, statusFilter, categoryFilter]);

  const publishedCount = announcements.filter(
    (item) => item.status === "published"
  ).length;

  const draftCount = announcements.filter(
    (item) => item.status === "draft"
  ).length;

  const urgentCount = announcements.filter(
    (item) => item.priority === "urgent"
  ).length;

  const renderTargetValue = () => {
    if (form.audience === "all") {
      return (
        <div className="h-12 rounded-xl bg-emerald-50 border border-emerald-100 flex items-center px-4 gap-2">
          <Users className="w-4 h-4 text-emerald-600" />

          <span className="text-xs font-bold text-emerald-700">
            All Students
          </span>
        </div>
      );
    }

    if (form.audience === "program") {
      return (
        <Select
          value={form.targetValue}
          onValueChange={(value) => updateForm("targetValue", value)}
        >
          <SelectTrigger className="h-12 bg-slate-50 border-none rounded-xl font-bold text-xs">
            <SelectValue placeholder="Select Program" />
          </SelectTrigger>

          <SelectContent className="rounded-xl bg-white border-none shadow-2xl">
            {PROGRAMS.map((program) => (
              <SelectItem key={program} value={program}>
                {program}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      );
    }

    if (form.audience === "year_level") {
      return (
        <Select
          value={form.targetValue}
          onValueChange={(value) => updateForm("targetValue", value)}
        >
          <SelectTrigger className="h-12 bg-slate-50 border-none rounded-xl font-bold text-xs">
            <SelectValue placeholder="Select Year Level" />
          </SelectTrigger>

          <SelectContent className="rounded-xl bg-white border-none shadow-2xl">
            {YEAR_LEVELS.map((year) => (
              <SelectItem key={year.value} value={year.value}>
                {year.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      );
    }

    return (
      <Select
        value={form.targetValue}
        onValueChange={(value) => updateForm("targetValue", value)}
      >
        <SelectTrigger className="h-12 bg-slate-50 border-none rounded-xl font-bold text-xs">
          <SelectValue placeholder="Select Campus" />
        </SelectTrigger>

        <SelectContent className="rounded-xl bg-white border-none shadow-2xl">
          {CAMPUSES.map((campus) => (
            <SelectItem key={campus} value={campus}>
              {campus}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    );
  };

  return (
    <div className="min-h-screen bg-slate-50/50 p-4 md:p-8 font-sans">
      <div className="max-w-7xl mx-auto space-y-8">

        {/* HEADER */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
          <div>
            <div className="flex items-center gap-2 mb-3">
              <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />

              <p className="text-[9px] font-black uppercase tracking-[0.25em] text-slate-400">
                Admin Content Management
              </p>
            </div>

            <h1 className="text-3xl md:text-5xl font-black uppercase italic tracking-tighter text-slate-900">
              Announcement <span className="text-indigo-600">Maker</span>
            </h1>

            <p className="text-xs md:text-sm font-medium text-slate-400 mt-2 max-w-2xl">
              Create, publish, and manage guidance announcements, IEC
              materials, awareness campaigns, seminars, and student
              information.
            </p>
          </div>

          <div className="flex items-center gap-3 bg-white px-5 py-4 rounded-2xl shadow-sm border border-slate-100">
            <ShieldCheck className="w-5 h-5 text-emerald-500" />

            <div>
              <p className="text-[9px] uppercase tracking-widest font-black text-slate-400">
                Administrator
              </p>

              <p className="text-xs font-black text-slate-800">
                Content Management
              </p>
            </div>
          </div>
        </div>

        {/* SUMMARY */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">

          <Card className="p-5 rounded-2xl border-none shadow-sm bg-white">
            <div className="flex justify-between items-center">
              <div>
                <p className="text-[9px] uppercase tracking-widest font-black text-slate-400">
                  Total Announcements
                </p>

                <p className="text-3xl font-black text-slate-900 mt-1">
                  {announcements.length}
                </p>
              </div>

              <div className="w-11 h-11 rounded-xl bg-indigo-50 flex items-center justify-center">
                <Megaphone className="w-5 h-5 text-indigo-600" />
              </div>
            </div>
          </Card>

          <Card className="p-5 rounded-2xl border-none shadow-sm bg-white">
            <div className="flex justify-between items-center">
              <div>
                <p className="text-[9px] uppercase tracking-widest font-black text-slate-400">
                  Published
                </p>

                <p className="text-3xl font-black text-emerald-600 mt-1">
                  {publishedCount}
                </p>
              </div>

              <div className="w-11 h-11 rounded-xl bg-emerald-50 flex items-center justify-center">
                <CheckCircle2 className="w-5 h-5 text-emerald-600" />
              </div>
            </div>
          </Card>

          <Card className="p-5 rounded-2xl border-none shadow-sm bg-white">
            <div className="flex justify-between items-center">
              <div>
                <p className="text-[9px] uppercase tracking-widest font-black text-slate-400">
                  Drafts / Urgent
                </p>

                <p className="text-3xl font-black text-amber-500 mt-1">
                  {draftCount} / {urgentCount}
                </p>
              </div>

              <div className="w-11 h-11 rounded-xl bg-amber-50 flex items-center justify-center">
                <AlertTriangle className="w-5 h-5 text-amber-600" />
              </div>
            </div>
          </Card>
        </div>

        {/* CREATOR */}
        <Card className="p-6 md:p-8 rounded-[2rem] border-none shadow-xl bg-white">

          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 pb-5 mb-6">

            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-2xl bg-indigo-50 flex items-center justify-center">
                <Bell className="w-5 h-5 text-indigo-600" />
              </div>

              <div>
                <h2 className="font-black uppercase tracking-tight text-slate-800">
                  {editingId ? "Edit Announcement" : "Create Announcement"}
                </h2>

                <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">
                  Guidance Information Dissemination
                </p>
              </div>
            </div>

            {editingId && (
              <Button
                type="button"
                variant="ghost"
                onClick={resetForm}
                className="rounded-xl text-xs font-black uppercase"
              >
                <X className="w-4 h-4 mr-2" />
                Cancel Edit
              </Button>
            )}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

            {/* MAIN CONTENT */}
            <div className="lg:col-span-2 space-y-5">

              <div className="space-y-2">
                <Label className="text-[9px] uppercase tracking-widest font-black text-slate-400">
                  Announcement Title
                </Label>

                <Input
                  value={form.title}
                  onChange={(e) =>
                    updateForm("title", e.target.value)
                  }
                  placeholder="e.g. Anti-Bullying Awareness Campaign"
                  className="h-14 rounded-xl bg-slate-50 border-none font-bold text-sm px-4"
                />
              </div>

              <div className="space-y-2">
                <Label className="text-[9px] uppercase tracking-widest font-black text-slate-400">
                  Announcement Content
                </Label>

                <textarea
                  value={form.content}
                  onChange={(e) =>
                    updateForm("content", e.target.value)
                  }
                  placeholder="Write the announcement, guidance information, instructions, schedule, or awareness message here..."
                  className="w-full min-h-[220px] resize-y rounded-2xl bg-slate-50 border-none p-5 text-sm font-medium text-slate-700 outline-none focus:ring-2 focus:ring-indigo-100"
                />

                <p className="text-[9px] text-slate-400 font-medium">
                  You may use this area for guidance program information,
                  IEC content descriptions, seminar notices, and awareness
                  campaigns.
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

                <div className="space-y-2">
                  <Label className="text-[9px] uppercase tracking-widest font-black text-slate-400">
                    Category
                  </Label>

                  <Select
                    value={form.category}
                    onValueChange={(value) =>
                      updateForm("category", value)
                    }
                  >
                    <SelectTrigger className="h-12 rounded-xl bg-slate-50 border-none font-bold text-xs">
                      <SelectValue />
                    </SelectTrigger>

                    <SelectContent className="rounded-xl bg-white border-none shadow-2xl">
                      {CATEGORIES.map((category) => (
                        <SelectItem
                          key={category}
                          value={category}
                        >
                          {category}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label className="text-[9px] uppercase tracking-widest font-black text-slate-400">
                    Priority
                  </Label>

                  <Select
                    value={form.priority}
                    onValueChange={(value) =>
                      updateForm(
                        "priority",
                        value as AnnouncementPriority
                      )
                    }
                  >
                    <SelectTrigger className="h-12 rounded-xl bg-slate-50 border-none font-bold text-xs">
                      <SelectValue />
                    </SelectTrigger>

                    <SelectContent className="rounded-xl bg-white border-none shadow-2xl">
                      <SelectItem value="normal">
                        Normal
                      </SelectItem>

                      <SelectItem value="important">
                        Important
                      </SelectItem>

                      <SelectItem value="urgent">
                        Urgent
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>

            {/* SETTINGS */}
            <div className="space-y-5">

              <div className="p-5 rounded-2xl bg-slate-50 border border-slate-100 space-y-4">

                <div className="flex items-center gap-2">
                  <Users className="w-4 h-4 text-indigo-600" />

                  <h3 className="text-xs font-black uppercase text-slate-800">
                    Target Audience
                  </h3>
                </div>

                <div className="space-y-2">
                  <Label className="text-[9px] uppercase tracking-widest font-black text-slate-400">
                    Audience Type
                  </Label>

                  <Select
                    value={form.audience}
                    onValueChange={(value) =>
                      handleAudienceChange(
                        value as AnnouncementAudience
                      )
                    }
                  >
                    <SelectTrigger className="h-12 rounded-xl bg-white border-none font-bold text-xs">
                      <SelectValue />
                    </SelectTrigger>

                    <SelectContent className="rounded-xl bg-white border-none shadow-2xl">
                      <SelectItem value="all">
                        All Students
                      </SelectItem>

                      <SelectItem value="program">
                        Specific Program
                      </SelectItem>

                      <SelectItem value="year_level">
                        Specific Year Level
                      </SelectItem>

                      <SelectItem value="campus">
                        Specific Campus
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {form.audience !== "all" && (
                  <div className="space-y-2">
                    <Label className="text-[9px] uppercase tracking-widest font-black text-slate-400">
                      Target
                    </Label>

                    {renderTargetValue()}
                  </div>
                )}
              </div>

              <div className="p-5 rounded-2xl bg-slate-50 border border-slate-100 space-y-4">

                <div className="flex items-center gap-2">
                  <CalendarDays className="w-4 h-4 text-indigo-600" />

                  <h3 className="text-xs font-black uppercase text-slate-800">
                    Publication Schedule
                  </h3>
                </div>

                <div className="space-y-2">
                  <Label className="text-[9px] uppercase tracking-widest font-black text-slate-400">
                    Publish At
                  </Label>

                  <Input
                    type="datetime-local"
                    value={form.publishAt}
                    onChange={(e) =>
                      updateForm("publishAt", e.target.value)
                    }
                    className="h-12 rounded-xl bg-white border-none font-bold text-xs"
                  />
                </div>

                <div className="space-y-2">
                  <Label className="text-[9px] uppercase tracking-widest font-black text-slate-400">
                    Expiration
                  </Label>

                  <Input
                    type="datetime-local"
                    value={form.expiresAt}
                    onChange={(e) =>
                      updateForm("expiresAt", e.target.value)
                    }
                    className="h-12 rounded-xl bg-white border-none font-bold text-xs"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* ACTIONS */}
          <div className="flex flex-col sm:flex-row gap-3 pt-6 mt-6 border-t border-slate-100">

            <Button
              type="button"
              disabled={saving}
              onClick={() => handleSave("draft")}
              className="h-13 flex-1 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-black uppercase text-[10px] tracking-widest"
            >
              {saving ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Save className="w-4 h-4 mr-2" />
              )}

              Save as Draft
            </Button>

            <Button
              type="button"
              disabled={saving}
              onClick={() => setPreviewOpen(true)}
              className="h-13 flex-1 rounded-xl bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-black uppercase text-[10px] tracking-widest"
            >
              <Eye className="w-4 h-4 mr-2" />

              Preview
            </Button>

            <Button
              type="button"
              disabled={saving}
              onClick={() => handleSave("published")}
              className="h-13 flex-1 rounded-xl bg-slate-900 hover:bg-indigo-600 text-white font-black uppercase text-[10px] tracking-widest"
            >
              {saving ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Send className="w-4 h-4 mr-2" />
              )}

              Publish Announcement
            </Button>
          </div>
        </Card>

        {/* ANNOUNCEMENT MANAGEMENT */}
        <Card className="p-6 md:p-8 rounded-[2rem] border-none shadow-xl bg-white">

          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-5 mb-6">

            <div>
              <h2 className="text-xl font-black uppercase italic tracking-tight text-slate-800">
                Announcement <span className="text-indigo-600">Library</span>
              </h2>

              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mt-1">
                Manage published and draft content
              </p>
            </div>

            <div className="flex flex-col md:flex-row gap-3">

              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />

                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search announcements..."
                  className="h-11 w-full md:w-64 pl-10 rounded-xl bg-slate-50 border-none text-xs font-bold"
                />
              </div>

              <Select
                value={statusFilter}
                onValueChange={setStatusFilter}
              >
                <SelectTrigger className="h-11 w-full md:w-40 rounded-xl bg-slate-50 border-none font-bold text-xs">
                  <SelectValue />
                </SelectTrigger>

                <SelectContent className="rounded-xl bg-white border-none shadow-xl">
                  <SelectItem value="all">All Status</SelectItem>
                  <SelectItem value="published">Published</SelectItem>
                  <SelectItem value="draft">Draft</SelectItem>
                </SelectContent>
              </Select>

              <Select
                value={categoryFilter}
                onValueChange={setCategoryFilter}
              >
                <SelectTrigger className="h-11 w-full md:w-48 rounded-xl bg-slate-50 border-none font-bold text-xs">
                  <SelectValue />
                </SelectTrigger>

                <SelectContent className="rounded-xl bg-white border-none shadow-xl">
                  <SelectItem value="all">
                    All Categories
                  </SelectItem>

                  {CATEGORIES.map((category) => (
                    <SelectItem
                      key={category}
                      value={category}
                    >
                      {category}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {loading ? (
            <div className="h-60 flex flex-col items-center justify-center">
              <Loader2 className="w-8 h-8 animate-spin text-indigo-600" />

              <p className="text-[10px] uppercase font-black tracking-widest text-slate-400 mt-3">
                Loading announcements...
              </p>
            </div>
          ) : filteredAnnouncements.length === 0 ? (
            <div className="h-60 rounded-2xl bg-slate-50 flex flex-col items-center justify-center text-center p-6">
              <FileText className="w-10 h-10 text-slate-300 mb-3" />

              <p className="font-black uppercase text-sm text-slate-500">
                No announcements found
              </p>

              <p className="text-xs text-slate-400 mt-1">
                Create your first guidance announcement above.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {filteredAnnouncements.map((announcement) => (
                <div
                  key={announcement.id}
                  className="border border-slate-100 rounded-2xl p-5 hover:shadow-md transition-all"
                >
                  <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-5">

                    <div className="flex-1 min-w-0">

                      <div className="flex flex-wrap items-center gap-2 mb-2">

                        <Badge
                          className={`border-none rounded-lg text-[8px] font-black uppercase ${getCategoryClasses(
                            announcement.category
                          )}`}
                        >
                          {announcement.category}
                        </Badge>

                        <Badge
                          className={`rounded-lg text-[8px] font-black uppercase border ${getPriorityClasses(
                            announcement.priority
                          )}`}
                        >
                          {announcement.priority}
                        </Badge>

                        <Badge
                          className={`rounded-lg text-[8px] font-black uppercase ${
                            announcement.status === "published"
                              ? "bg-emerald-50 text-emerald-600"
                              : "bg-slate-100 text-slate-500"
                          }`}
                        >
                          {announcement.status}
                        </Badge>
                      </div>

                      <h3 className="text-base md:text-lg font-black text-slate-800">
                        {announcement.title}
                      </h3>

                      <p className="text-xs text-slate-500 font-medium mt-2 line-clamp-2">
                        {announcement.content}
                      </p>

                      <div className="flex flex-wrap gap-4 mt-4 text-[9px] font-black uppercase tracking-wider text-slate-400">

                        <span className="flex items-center gap-1.5">
                          <Users className="w-3.5 h-3.5" />

                          {announcement.audience === "all"
                            ? "All Students"
                            : `${announcement.audience}: ${
                                announcement.target_value || "-"
                              }`}
                        </span>

                        <span className="flex items-center gap-1.5">
                          <CalendarDays className="w-3.5 h-3.5" />

                          {announcement.status === "published"
                            ? `Published ${formatDate(
                                announcement.publish_at
                              )}`
                            : `Created ${formatDate(
                                announcement.created_at
                              )}`}
                        </span>

                        {announcement.expires_at && (
                          <span>
                            Expires {formatDate(announcement.expires_at)}
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-2">

                      <Button
                        type="button"
                        variant="ghost"
                        onClick={() => handleEdit(announcement)}
                        className="h-10 w-10 p-0 rounded-xl hover:bg-indigo-50 hover:text-indigo-600"
                        title="Edit"
                      >
                        <Edit3 className="w-4 h-4" />
                      </Button>

                      <Button
                        type="button"
                        variant="ghost"
                        onClick={() => togglePublish(announcement)}
                        className="h-10 w-10 p-0 rounded-xl hover:bg-emerald-50 hover:text-emerald-600"
                        title={
                          announcement.status === "published"
                            ? "Unpublish"
                            : "Publish"
                        }
                      >
                        {announcement.status === "published" ? (
                          <EyeOff className="w-4 h-4" />
                        ) : (
                          <Eye className="w-4 h-4" />
                        )}
                      </Button>

                      <Button
                        type="button"
                        variant="ghost"
                        onClick={() =>
                          handleDelete(announcement.id)
                        }
                        className="h-10 w-10 p-0 rounded-xl hover:bg-red-50 hover:text-red-600"
                        title="Delete"
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      {/* PREVIEW MODAL */}
      {previewOpen && (
        <div className="fixed inset-0 z-[200] bg-slate-950/60 backdrop-blur-sm flex items-center justify-center p-4">

          <Card className="w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-[2rem] border-none shadow-2xl bg-white">

            <div className="p-6 md:p-8">

              <div className="flex items-start justify-between gap-4 border-b border-slate-100 pb-5 mb-6">

                <div>
                  <p className="text-[9px] uppercase tracking-widest font-black text-indigo-600">
                    Announcement Preview
                  </p>

                  <h2 className="text-2xl font-black text-slate-900 mt-1">
                    {form.title || "Untitled Announcement"}
                  </h2>
                </div>

                <Button
                  variant="ghost"
                  onClick={() => setPreviewOpen(false)}
                  className="h-10 w-10 p-0 rounded-xl"
                >
                  <X className="w-5 h-5" />
                </Button>
              </div>

              <div className="flex flex-wrap gap-2 mb-5">

                <Badge
                  className={`border-none rounded-lg text-[9px] font-black uppercase ${getCategoryClasses(
                    form.category
                  )}`}
                >
                  {form.category}
                </Badge>

                <Badge
                  className={`rounded-lg text-[9px] font-black uppercase border ${getPriorityClasses(
                    form.priority
                  )}`}
                >
                  {form.priority}
                </Badge>

                <Badge className="bg-indigo-50 text-indigo-600 border-none rounded-lg text-[9px] font-black uppercase">
                  {form.audience === "all"
                    ? "All Students"
                    : `${form.audience}: ${form.targetValue}`}
                </Badge>
              </div>

              <div className="whitespace-pre-wrap text-sm leading-7 text-slate-600 font-medium">
                {form.content || "No announcement content yet."}
              </div>

              <div className="mt-8 pt-5 border-t border-slate-100 grid grid-cols-1 sm:grid-cols-2 gap-4">

                <div>
                  <p className="text-[9px] uppercase tracking-widest font-black text-slate-400">
                    Publish
                  </p>

                  <p className="text-xs font-bold text-slate-700 mt-1">
                    {form.publishAt
                      ? formatDateTime(
                          new Date(form.publishAt).toISOString()
                        )
                      : "Immediately upon publishing"}
                  </p>
                </div>

                <div>
                  <p className="text-[9px] uppercase tracking-widest font-black text-slate-400">
                    Expiration
                  </p>

                  <p className="text-xs font-bold text-slate-700 mt-1">
                    {form.expiresAt
                      ? formatDateTime(
                          new Date(form.expiresAt).toISOString()
                        )
                      : "No expiration"}
                  </p>
                </div>
              </div>

              <Button
                onClick={() => setPreviewOpen(false)}
                className="w-full mt-7 h-12 rounded-xl bg-slate-900 hover:bg-indigo-600 text-white font-black uppercase text-xs tracking-widest"
              >
                Close Preview
              </Button>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}