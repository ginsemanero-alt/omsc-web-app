import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Card } from "../ui/card";
import { Button } from "../ui/button";
import { Badge } from "../ui/badge";
import { useToast } from "../../hooks/use-toast";
import { supabase } from "../../lib/supabase";

import {
  Activity,
  CalendarDays,
  CheckCircle2,
  Clock,
  FileCheck2,
  Loader2,
  RefreshCw,
  Users,
  ClipboardCheck,
  ChevronDown,
  ChevronUp,
  MapPin,
  Info,
  AlertCircle,
} from "lucide-react";

/* =========================================================
   TYPES
========================================================= */

type ActivityType = "registration" | "survey";

interface ActivityItem {
  id: string;
  type: ActivityType;

  title: string;
  description?: string;

  created_at: string;

  // Program information
  program_id?: number | string;
  program_date?: string | null;
  program_time?: string | null;
  program_location?: string | null;
  program_component?: string | null;
  guidance_service?: string | null;
  registration_status?: string | null;
  capacity?: number | null;

  // Survey information
  survey_id?: string;
  survey_category?: string | null;
  survey_status?: string | null;

  // Optional
  details?: string;
}

/* =========================================================
   HELPERS
========================================================= */

const formatDate = (value?: string | null) => {
  if (!value) return "Date unavailable";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
};

const formatDateLong = (value?: string | null) => {
  if (!value) return "Date unavailable";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
};

const formatTime = (value?: string | null) => {
  if (!value) return "";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "";
  }

  return date.toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
  });
};

const normalizeStatus = (status?: string | null) => {
  if (!status) return "unknown";

  return status
    .toString()
    .trim()
    .toLowerCase()
    .replace(/[_-]+/g, " ");
};

const getRegistrationStatusClass = (status?: string | null) => {
  const normalized = normalizeStatus(status);

  if (normalized === "approved" || normalized === "confirmed") {
    return "bg-emerald-100 text-emerald-700";
  }

  if (normalized === "pending") {
    return "bg-amber-100 text-amber-700";
  }

  if (
    normalized === "cancelled" ||
    normalized === "canceled" ||
    normalized === "rejected"
  ) {
    return "bg-rose-100 text-rose-700";
  }

  return "bg-slate-100 text-slate-600";
};

const getProgramStatus = (programDate?: string | null) => {
  if (!programDate) return "scheduled";

  const today = new Date();
  const eventDate = new Date(`${programDate}T00:00:00`);

  if (Number.isNaN(eventDate.getTime())) {
    return "scheduled";
  }

  const todayOnly = new Date(
    today.getFullYear(),
    today.getMonth(),
    today.getDate()
  );

  if (eventDate.getTime() < todayOnly.getTime()) {
    return "completed";
  }

  if (eventDate.getTime() === todayOnly.getTime()) {
    return "today";
  }

  return "upcoming";
};

/* =========================================================
   COMPONENT
========================================================= */

const MyGuidanceActivity: React.FC = () => {
  const { toast } = useToast();

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const [activities, setActivities] = useState<ActivityItem[]>([]);

  const [filter, setFilter] = useState<
    "all" | "registration" | "survey"
  >("all");

  const [expandedId, setExpandedId] = useState<string | null>(null);

  /* =======================================================
     GET CURRENT USER ID
  ======================================================= */

  const getCurrentUserId = async (): Promise<string | number | null> => {
    /*
      Your actual tables use:

      program_registrations.user_id
      survey_responses.user_id

      Your sample record uses:
      user_id = 3

      Therefore we prioritize localStorage userId if your
      existing login system stores the database user ID there.
    */

    const storedUserId = localStorage.getItem("userId");

    if (storedUserId) {
      return storedUserId;
    }

    const {
      data: { user },
    } = await supabase.auth.getUser();

    return user?.id || null;
  };

  /* =======================================================
     FETCH PROGRAM REGISTRATIONS
  ======================================================= */

  const fetchProgramRegistrations = async (
    userId: string | number
  ): Promise<ActivityItem[]> => {
    try {
      const { data, error } = await supabase
        .from("program_registrations")
        .select(`
          id,
          created_at,
          program_id,
          user_id,
          status
        `)
        .eq("user_id", userId)
        .order("created_at", { ascending: false });

      if (error) {
        console.warn(
          "Program registrations fetch error:",
          error.message
        );

        return [];
      }

      if (!data || data.length === 0) {
        return [];
      }

      /* -----------------------------------------------------
         Get program IDs
      ----------------------------------------------------- */

      const programIds = [
        ...new Set(
          data
            .map((item: any) => item.program_id)
            .filter(
              (id: any) => id !== null && id !== undefined
            )
        ),
      ];

      let programsMap: Record<string, any> = {};

      if (programIds.length > 0) {
        const { data: programs, error: programsError } =
          await supabase
            .from("programs")
            .select(`
              id,
              title,
              date,
              time_range,
              location,
              program_component,
              guidance_service,
              capacity,
              status,
              content
            `)
            .in("id", programIds);

        if (programsError) {
          console.warn(
            "Programs lookup error:",
            programsError.message
          );
        } else {
          programsMap = (programs || []).reduce(
            (acc: Record<string, any>, program: any) => {
              acc[String(program.id)] = program;
              return acc;
            },
            {}
          );
        }
      }

      /* -----------------------------------------------------
         Format activity records
      ----------------------------------------------------- */

      return data.map((registration: any) => {
        const program =
          programsMap[String(registration.program_id)];

        return {
          id: `registration-${registration.id}`,
          type: "registration",

          title:
            program?.title ||
            `Guidance Program #${registration.program_id}`,

          description:
            program?.content ||
            "You registered for a Guidance Office program.",

          created_at: registration.created_at,

          program_id: registration.program_id,
          program_date: program?.date || null,
          program_time: program?.time_range || null,
          program_location: program?.location || null,
          program_component:
            program?.program_component || null,
          guidance_service:
            program?.guidance_service || null,
          registration_status:
            registration.status || "pending",
          capacity: program?.capacity ?? null,

          details: program
            ? `Registered for ${program.title}.`
            : "Program registration recorded.",
        };
      });
    } catch (error) {
      console.warn(
        "Unexpected program registration error:",
        error
      );

      return [];
    }
  };

  /* =======================================================
     FETCH SURVEY RESPONSES
  ======================================================= */

  const fetchSurveyResponses = async (
    userId: string | number
  ): Promise<ActivityItem[]> => {
    try {
      /*
        IMPORTANT:
        Your actual column is:

        survey_responses.user_id

        NOT student_id.
      */

      const { data, error } = await supabase
        .from("survey_responses")
        .select(`
          id,
          created_at,
          user_id,
          survey_id
        `)
        .eq("user_id", userId)
        .order("created_at", { ascending: false });

      if (error) {
        console.warn(
          "Survey responses fetch error:",
          error.message
        );

        return [];
      }

      if (!data || data.length === 0) {
        return [];
      }

      /* -----------------------------------------------------
         Get survey IDs
      ----------------------------------------------------- */

      const surveyIds = [
        ...new Set(
          data
            .map((item: any) => item.survey_id)
            .filter(
              (id: any) => id !== null && id !== undefined
            )
        ),
      ];

      let surveysMap: Record<string, any> = {};

      if (surveyIds.length > 0) {
        const { data: surveys, error: surveysError } =
          await supabase
            .from("surveys")
            .select(`
              id,
              title,
              description,
              category,
              status,
              start_date,
              end_date
            `)
            .in("id", surveyIds);

        if (surveysError) {
          console.warn(
            "Surveys lookup error:",
            surveysError.message
          );
        } else {
          surveysMap = (surveys || []).reduce(
            (acc: Record<string, any>, survey: any) => {
              acc[String(survey.id)] = survey;
              return acc;
            },
            {}
          );
        }
      }

      /* -----------------------------------------------------
         Format survey activity
      ----------------------------------------------------- */

      return data.map((response: any) => {
        const survey =
          surveysMap[String(response.survey_id)];

        return {
          id: `survey-${response.id}`,
          type: "survey",

          title:
            survey?.title ||
            "Guidance Survey Response",

          description:
            survey?.description ||
            "You submitted a response to a Guidance Office survey.",

          created_at: response.created_at,

          survey_id: response.survey_id,
          survey_category:
            survey?.category || null,
          survey_status:
            survey?.status || null,

          details:
            survey?.category
              ? `Category: ${survey.category}`
              : "Survey response submitted.",
        };
      });
    } catch (error) {
      console.warn(
        "Unexpected survey response error:",
        error
      );

      return [];
    }
  };

  /* =======================================================
     MAIN FETCH
  ======================================================= */

  const fetchActivity = useCallback(
    async (isRefresh = false) => {
      if (isRefresh) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }

      try {
        const userId = await getCurrentUserId();

        if (!userId) {
          setActivities([]);

          toast({
            variant: "destructive",
            title: "Account Not Found",
            description:
              "Unable to identify your student account.",
          });

          return;
        }

        /*
          Fetch both activity sources.

          1. Program registrations
          2. Survey responses
        */

        const [registrationActivity, surveyActivity] =
          await Promise.all([
            fetchProgramRegistrations(userId),
            fetchSurveyResponses(userId),
          ]);

        const combined = [
          ...registrationActivity,
          ...surveyActivity,
        ].sort(
          (a, b) =>
            new Date(b.created_at).getTime() -
            new Date(a.created_at).getTime()
        );

        setActivities(combined);
      } catch (error: any) {
        console.error(
          "Failed to load Guidance Activity:",
          error
        );

        toast({
          variant: "destructive",
          title: "Activity Loading Error",
          description:
            error?.message ||
            "Failed to load your Guidance activity.",
        });
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [toast]
  );

  /* =======================================================
     INITIAL LOAD
  ======================================================= */

  useEffect(() => {
    fetchActivity();
  }, [fetchActivity]);

  /* =======================================================
     FILTER
  ======================================================= */

  const filteredActivities = useMemo(() => {
    if (filter === "all") {
      return activities;
    }

    return activities.filter(
      (item) => item.type === filter
    );
  }, [activities, filter]);

  /* =======================================================
     SUMMARY
  ======================================================= */

  const registrationCount = activities.filter(
    (item) => item.type === "registration"
  ).length;

  const surveyCount = activities.filter(
    (item) => item.type === "survey"
  ).length;

  const latestActivity = activities.length
    ? activities[0]
    : null;

  /* =======================================================
     LOADING
  ======================================================= */

  if (loading) {
    return (
      <div className="min-h-screen bg-[#f8fafc] flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-10 h-10 animate-spin text-indigo-600 mx-auto" />

          <p className="mt-4 text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">
            Loading Your Guidance Activity
          </p>
        </div>
      </div>
    );
  }

  /* =======================================================
     UI
  ======================================================= */

  return (
    <div className="min-h-screen bg-[#f8fafc] py-6 md:py-10">
      <div className="max-w-[1100px] mx-auto px-4 md:px-6">

        {/* =================================================
            HEADER
        ================================================= */}

        <div className="mb-8">
          <div className="flex flex-col md:flex-row md:items-end justify-between gap-5">

            <div>
              <Badge className="mb-3 bg-indigo-500/10 text-indigo-600 border-indigo-200 font-black text-[9px] uppercase tracking-[0.18em]">
                Student Activity Center
              </Badge>

              <h1 className="text-3xl md:text-5xl font-black text-slate-900 tracking-tighter uppercase italic">
                My{" "}
                <span className="text-indigo-600">
                  Guidance Activity
                </span>
              </h1>

              <p className="mt-2 text-[10px] md:text-xs font-bold uppercase tracking-[0.16em] text-slate-400 max-w-2xl">
                View your guidance program registrations
                and completed surveys in one place.
              </p>
            </div>

            <Button
              onClick={() => fetchActivity(true)}
              disabled={refreshing}
              variant="outline"
              className="rounded-2xl h-11 px-5 border-slate-200 bg-white font-black uppercase text-[10px] tracking-wider gap-2"
            >
              <RefreshCw
                size={14}
                className={
                  refreshing ? "animate-spin" : ""
                }
              />

              {refreshing
                ? "Refreshing..."
                : "Refresh Activity"}
            </Button>
          </div>
        </div>

        {/* =================================================
            SUMMARY CARDS
        ================================================= */}

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-7">

          {/* ALL */}
          <Card className="rounded-[1.8rem] border-none shadow-sm bg-white p-5">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-2xl bg-indigo-50 text-indigo-600 flex items-center justify-center">
                <Activity size={22} />
              </div>

              <div>
                <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">
                  Total Activity
                </p>

                <p className="text-2xl font-black text-slate-900">
                  {activities.length}
                </p>
              </div>
            </div>
          </Card>

          {/* REGISTRATIONS */}
          <Card className="rounded-[1.8rem] border-none shadow-sm bg-white p-5">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
                <Users size={22} />
              </div>

              <div>
                <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">
                  Program Registrations
                </p>

                <p className="text-2xl font-black text-slate-900">
                  {registrationCount}
                </p>
              </div>
            </div>
          </Card>

          {/* SURVEYS */}
          <Card className="rounded-[1.8rem] border-none shadow-sm bg-white p-5">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-2xl bg-violet-50 text-violet-600 flex items-center justify-center">
                <ClipboardCheck size={22} />
              </div>

              <div>
                <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">
                  Surveys Completed
                </p>

                <p className="text-2xl font-black text-slate-900">
                  {surveyCount}
                </p>
              </div>
            </div>
          </Card>
        </div>

        {/* =================================================
            LATEST ACTIVITY
        ================================================= */}

        {latestActivity && (
          <Card className="mb-7 rounded-[2rem] border-none shadow-sm bg-slate-900 text-white p-6 md:p-7 overflow-hidden relative">
            <div className="absolute -right-10 -top-10 w-40 h-40 rounded-full bg-indigo-500/20 blur-2xl" />

            <div className="relative">
              <div className="flex items-center gap-2 mb-3">
                <Clock
                  size={14}
                  className="text-indigo-300"
                />

                <span className="text-[9px] font-black uppercase tracking-[0.18em] text-slate-400">
                  Latest Activity
                </span>
              </div>

              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                  <h2 className="text-xl md:text-2xl font-black uppercase tracking-tight">
                    {latestActivity.title}
                  </h2>

                  <p className="mt-1 text-xs text-slate-400 font-medium">
                    {latestActivity.type ===
                    "registration"
                      ? "Program registration"
                      : "Survey response submitted"}
                  </p>
                </div>

                <div className="text-left md:text-right">
                  <p className="text-xs font-bold text-white">
                    {formatDate(
                      latestActivity.created_at
                    )}
                  </p>

                  <p className="text-[10px] text-slate-400 font-medium">
                    {formatTime(
                      latestActivity.created_at
                    )}
                  </p>
                </div>
              </div>
            </div>
          </Card>
        )}

        {/* =================================================
            FILTERS
        ================================================= */}

        <div className="flex flex-wrap gap-2 mb-6">

          <button
            type="button"
            onClick={() => setFilter("all")}
            className={`px-4 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all ${
              filter === "all"
                ? "bg-slate-900 text-white shadow-lg"
                : "bg-white text-slate-500 border border-slate-200 hover:bg-slate-100"
            }`}
          >
            All Activity ({activities.length})
          </button>

          <button
            type="button"
            onClick={() =>
              setFilter("registration")
            }
            className={`px-4 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all ${
              filter === "registration"
                ? "bg-emerald-600 text-white shadow-lg shadow-emerald-600/20"
                : "bg-white text-slate-500 border border-slate-200 hover:bg-slate-100"
            }`}
          >
            Program Registrations (
            {registrationCount})
          </button>

          <button
            type="button"
            onClick={() => setFilter("survey")}
            className={`px-4 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all ${
              filter === "survey"
                ? "bg-indigo-600 text-white shadow-lg shadow-indigo-600/20"
                : "bg-white text-slate-500 border border-slate-200 hover:bg-slate-100"
            }`}
          >
            Surveys Completed ({surveyCount})
          </button>
        </div>

        {/* =================================================
            ACTIVITY LIST
        ================================================= */}

        <Card className="rounded-[2rem] md:rounded-[2.5rem] border-none shadow-xl bg-white p-4 sm:p-6 md:p-8">

          {filteredActivities.length === 0 ? (
            <div className="text-center py-16 px-5">

              <div className="mx-auto w-16 h-16 rounded-3xl bg-slate-100 flex items-center justify-center text-slate-300">
                <Activity size={30} />
              </div>

              <h3 className="mt-5 text-lg font-black text-slate-700 uppercase italic">
                No Activity Yet
              </h3>

              <p className="mt-2 text-xs font-medium text-slate-400 max-w-md mx-auto leading-relaxed">
                Your Guidance Program registrations
                and completed surveys will appear here
                automatically.
              </p>
            </div>
          ) : (
            <div className="space-y-4">

              {filteredActivities.map(
                (item) => {
                  const isRegistration =
                    item.type ===
                    "registration";

                  const isExpanded =
                    expandedId === item.id;

                  return (
                    <div
                      key={item.id}
                      className="rounded-2xl md:rounded-3xl bg-slate-50 border border-slate-100 overflow-hidden hover:border-indigo-200 transition-all"
                    >

                      {/* -----------------------------------
                          MAIN ROW
                      ----------------------------------- */}

                      <div className="p-5 md:p-6 flex flex-col md:flex-row gap-4 md:items-center">

                        <div
                          className={`w-12 h-12 md:w-14 md:h-14 rounded-2xl shrink-0 flex items-center justify-center ${
                            isRegistration
                              ? "bg-emerald-100 text-emerald-600"
                              : "bg-indigo-100 text-indigo-600"
                          }`}
                        >
                          {isRegistration ? (
                            <Users size={23} />
                          ) : (
                            <FileCheck2 size={23} />
                          )}
                        </div>

                        <div className="flex-1 min-w-0">

                          {/* BADGES */}

                          <div className="flex flex-wrap items-center gap-2 mb-2">

                            <span
                              className={`px-2.5 py-1 rounded-full text-[8px] font-black uppercase tracking-widest ${
                                isRegistration
                                  ? "bg-emerald-100 text-emerald-700"
                                  : "bg-indigo-100 text-indigo-700"
                              }`}
                            >
                              {isRegistration
                                ? "Program Registered"
                                : "Survey Completed"}
                            </span>

                            <span className="inline-flex items-center gap-1 text-[9px] font-bold text-slate-400">
                              <Clock size={11} />

                              {formatDate(
                                item.created_at
                              )}

                              {formatTime(
                                item.created_at
                              ) &&
                                ` • ${formatTime(
                                  item.created_at
                                )}`}
                            </span>
                          </div>

                          {/* TITLE */}

                          <h3 className="text-base md:text-lg font-black text-slate-800 uppercase tracking-tight">
                            {item.title}
                          </h3>

                          {/* SHORT DESCRIPTION */}

                          {item.description && (
                            <p className="mt-1 text-xs font-medium text-slate-500 line-clamp-2">
                              {item.description}
                            </p>
                          )}

                          {/* QUICK INFO */}

                          <div className="flex flex-wrap gap-x-4 gap-y-2 mt-3">

                            {isRegistration &&
                              item.program_date && (
                                <span className="flex items-center gap-1.5 text-[9px] font-black uppercase tracking-wide text-slate-400">
                                  <CalendarDays
                                    size={12}
                                    className="text-indigo-500"
                                  />

                                  {formatDate(
                                    item.program_date
                                  )}
                                </span>
                              )}

                            {isRegistration &&
                              item.program_location && (
                                <span className="flex items-center gap-1.5 text-[9px] font-black uppercase tracking-wide text-slate-400">
                                  <MapPin
                                    size={12}
                                    className="text-indigo-500"
                                  />

                                  {item.program_location}
                                </span>
                              )}

                            {item.guidance_service && (
                              <span className="text-[9px] font-black uppercase tracking-wide text-indigo-500">
                                {item.guidance_service}
                              </span>
                            )}

                            {item.survey_category && (
                              <span className="text-[9px] font-black uppercase tracking-wide text-violet-500">
                                {item.survey_category}
                              </span>
                            )}
                          </div>
                        </div>

                        {/* RIGHT SIDE */}

                        <div className="flex items-center justify-between md:justify-end gap-3 shrink-0">

                          {isRegistration ? (
                            <span
                              className={`px-3 py-1.5 rounded-xl text-[9px] font-black uppercase tracking-wider ${getRegistrationStatusClass(
                                item.registration_status
                              )}`}
                            >
                              {normalizeStatus(
                                item.registration_status
                              )}
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-100 text-emerald-700 text-[9px] font-black uppercase tracking-wider">
                              <CheckCircle2
                                size={12}
                              />
                              Submitted
                            </span>
                          )}

                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            onClick={() =>
                              setExpandedId(
                                isExpanded
                                  ? null
                                  : item.id
                              )
                            }
                            className="h-9 w-9 rounded-xl bg-white border border-slate-100"
                          >
                            {isExpanded ? (
                              <ChevronUp
                                size={16}
                              />
                            ) : (
                              <ChevronDown
                                size={16}
                              />
                            )}
                          </Button>
                        </div>
                      </div>

                      {/* -----------------------------------
                          EXPANDED DETAILS
                      ----------------------------------- */}

                      {isExpanded && (
                        <div className="border-t border-slate-100 bg-white p-5 md:p-6">

                          {isRegistration ? (
                            <div className="space-y-5">

                              <div>
                                <p className="text-[9px] font-black uppercase tracking-[0.18em] text-indigo-500 mb-2">
                                  Registration Details
                                </p>

                                <p className="text-xs font-medium text-slate-600 leading-relaxed">
                                  {item.details ||
                                    "You registered for this Guidance Program."}
                                </p>
                              </div>

                              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">

                                <div className="p-4 rounded-2xl bg-slate-50">
                                  <div className="flex items-center gap-2 mb-2">
                                    <CalendarDays
                                      size={14}
                                      className="text-indigo-500"
                                    />

                                    <span className="text-[8px] font-black uppercase tracking-widest text-slate-400">
                                      Program Date
                                    </span>
                                  </div>

                                  <p className="text-xs font-black text-slate-700">
                                    {item.program_date
                                      ? formatDateLong(
                                          item.program_date
                                        )
                                      : "Not specified"}
                                  </p>
                                </div>

                                <div className="p-4 rounded-2xl bg-slate-50">
                                  <div className="flex items-center gap-2 mb-2">
                                    <Clock
                                      size={14}
                                      className="text-indigo-500"
                                    />

                                    <span className="text-[8px] font-black uppercase tracking-widest text-slate-400">
                                      Schedule
                                    </span>
                                  </div>

                                  <p className="text-xs font-black text-slate-700">
                                    {item.program_time ||
                                      "Not specified"}
                                  </p>
                                </div>

                                <div className="p-4 rounded-2xl bg-slate-50">
                                  <div className="flex items-center gap-2 mb-2">
                                    <MapPin
                                      size={14}
                                      className="text-indigo-500"
                                    />

                                    <span className="text-[8px] font-black uppercase tracking-widest text-slate-400">
                                      Location
                                    </span>
                                  </div>

                                  <p className="text-xs font-black text-slate-700">
                                    {item.program_location ||
                                      "Not specified"}
                                  </p>
                                </div>

                                <div className="p-4 rounded-2xl bg-slate-50">
                                  <div className="flex items-center gap-2 mb-2">
                                    <Activity
                                      size={14}
                                      className="text-indigo-500"
                                    />

                                    <span className="text-[8px] font-black uppercase tracking-widest text-slate-400">
                                      Program Component
                                    </span>
                                  </div>

                                  <p className="text-xs font-black text-slate-700">
                                    {item.program_component ||
                                      "Not specified"}
                                  </p>
                                </div>

                                <div className="p-4 rounded-2xl bg-slate-50">
                                  <div className="flex items-center gap-2 mb-2">
                                    <Info
                                      size={14}
                                      className="text-indigo-500"
                                    />

                                    <span className="text-[8px] font-black uppercase tracking-widest text-slate-400">
                                      Guidance Service
                                    </span>
                                  </div>

                                  <p className="text-xs font-black text-slate-700">
                                    {item.guidance_service ||
                                      "Not specified"}
                                  </p>
                                </div>

                                <div className="p-4 rounded-2xl bg-slate-50">
                                  <div className="flex items-center gap-2 mb-2">
                                    <Users
                                      size={14}
                                      className="text-indigo-500"
                                    />

                                    <span className="text-[8px] font-black uppercase tracking-widest text-slate-400">
                                      Registration
                                    </span>
                                  </div>

                                  <p className="text-xs font-black text-slate-700 uppercase">
                                    {normalizeStatus(
                                      item.registration_status
                                    )}
                                  </p>
                                </div>
                              </div>

                              {/* EVENT STATUS */}

                              {item.program_date && (
                                <div className="flex items-start gap-3 p-4 rounded-2xl bg-indigo-50 border border-indigo-100">

                                  <CalendarDays
                                    size={17}
                                    className="text-indigo-600 mt-0.5 shrink-0"
                                  />

                                  <div>
                                    <p className="text-[9px] font-black uppercase tracking-widest text-indigo-600">
                                      Program Schedule Status
                                    </p>

                                    <p className="mt-1 text-xs font-bold text-slate-700 uppercase">
                                      {getProgramStatus(
                                        item.program_date
                                      )}
                                    </p>
                                  </div>
                                </div>
                              )}
                            </div>
                          ) : (
                            <div className="space-y-5">

                              <div>
                                <p className="text-[9px] font-black uppercase tracking-[0.18em] text-indigo-500 mb-2">
                                  Survey Activity
                                </p>

                                <p className="text-xs font-medium text-slate-600 leading-relaxed">
                                  {item.description ||
                                    "Your survey response was successfully recorded."}
                                </p>
                              </div>

                              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">

                                <div className="p-4 rounded-2xl bg-indigo-50">
                                  <p className="text-[8px] font-black uppercase tracking-widest text-indigo-500 mb-2">
                                    Survey
                                  </p>

                                  <p className="text-xs font-black text-slate-700">
                                    {item.title}
                                  </p>
                                </div>

                                <div className="p-4 rounded-2xl bg-violet-50">
                                  <p className="text-[8px] font-black uppercase tracking-widest text-violet-500 mb-2">
                                    Category
                                  </p>

                                  <p className="text-xs font-black text-slate-700">
                                    {item.survey_category ||
                                      "General Guidance"}
                                  </p>
                                </div>

                                <div className="p-4 rounded-2xl bg-emerald-50">
                                  <p className="text-[8px] font-black uppercase tracking-widest text-emerald-600 mb-2">
                                    Response Status
                                  </p>

                                  <p className="text-xs font-black text-slate-700 uppercase">
                                    Submitted
                                  </p>
                                </div>
                              </div>

                              <div className="flex items-start gap-3 p-4 rounded-2xl bg-slate-50 border border-slate-100">

                                <CheckCircle2
                                  size={17}
                                  className="text-emerald-500 mt-0.5 shrink-0"
                                />

                                <div>
                                  <p className="text-[9px] font-black uppercase tracking-widest text-slate-600">
                                    Response Recorded
                                  </p>

                                  <p className="mt-1 text-xs font-medium text-slate-500">
                                    Your response was recorded on{" "}
                                    <strong>
                                      {formatDateLong(
                                        item.created_at
                                      )}
                                    </strong>{" "}
                                    at{" "}
                                    <strong>
                                      {formatTime(
                                        item.created_at
                                      )}
                                    </strong>
                                    .
                                  </p>
                                </div>
                              </div>

                              <div className="flex items-start gap-3 p-4 rounded-2xl bg-amber-50 border border-amber-100">

                                <AlertCircle
                                  size={17}
                                  className="text-amber-600 mt-0.5 shrink-0"
                                />

                                <p className="text-[10px] font-medium text-amber-800 leading-relaxed">
                                  Your survey answers are not displayed
                                  in this activity timeline. This keeps
                                  your personal responses private while
                                  still allowing you to see that the
                                  survey was completed.
                                </p>
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                }
              )}
            </div>
          )}
        </Card>

        {/* =================================================
            FOOTER NOTE
        ================================================= */}

        <div className="mt-6 text-center">
          <p className="text-[9px] font-bold uppercase tracking-[0.16em] text-slate-400">
            Your Guidance Activity • OMSC Guidance and
            Testing Center
          </p>
        </div>
      </div>
    </div>
  );
};

export default MyGuidanceActivity;