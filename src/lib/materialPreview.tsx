import { FileText, Image as ImageIcon, Link as LinkIcon, Music, PlayCircle } from "lucide-react";

// What a visitor who is not signed in may see of an IEC material (PHASE 35):
// title, short description, type and a thumbnail. Never the file itself.

export interface MaterialPreview {
  id: number;
  title: string;
  type: string;
  description?: string | null;
  category?: string | null;
  image_url?: string | null;
}

export interface TypeStyle {
  label: string;
  icon: React.ElementType;
  tile: string; // tile background
  ink: string; // icon + badge text
}

// Type -> badge label, tint, and icon.
export function typeStyle(type: string): TypeStyle {
  switch ((type || "").toLowerCase()) {
    case "image":
      return { label: "Infographic", icon: ImageIcon, tile: "bg-[#E0E7FF]", ink: "text-[#4338CA]" };
    case "video":
      return { label: "Video", icon: PlayCircle, tile: "bg-[#FEF3C7]", ink: "text-[#B45309]" };
    case "audio":
      return { label: "Audio", icon: Music, tile: "bg-[#EDE9FE]", ink: "text-[#6D28D9]" };
    case "link":
      return { label: "Link", icon: LinkIcon, tile: "bg-[#E0F2FE]", ink: "text-[#0369A1]" };
    default:
      return { label: "Document", icon: FileText, tile: "bg-[#D1FAE5]", ink: "text-[#047857]" };
  }
}

// The thumbnail shown publicly. An infographic's image_url is a small preview
// made when it was uploaded (stored under /previews/), so it is safe to show.
// An infographic whose image_url is NOT such a preview is still the full
// image from before PHASE 35, so it gets the icon tile instead: the full
// image must never reach a visitor.
export function thumbnailFor(material: MaterialPreview): string | null {
  if (!material.image_url) return null;
  if ((material.type || "").toLowerCase() === "image" && !material.image_url.includes("/previews/")) return null;
  return material.image_url;
}

// A short plain-text excerpt of a description.
export function shortDescription(text: string | null | undefined, max = 140): string {
  const clean = (text || "").replace(/\s+/g, " ").trim();
  return clean.length <= max ? clean : `${clean.slice(0, max - 1).trimEnd()}…`;
}
