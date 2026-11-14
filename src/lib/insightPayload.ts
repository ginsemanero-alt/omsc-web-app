// What the Analytics AI Insight is sent from the page (aggregates only: no name, e-mail, student ID or
// individual record). The Learning gain figures are added by the server (api/insightLearningGain.js)
// because telling students from records, and the student-level t-test, need per-student data.
//
// Rules this file follows:
//   * every count says whether it is STUDENTS or RECORDS;
//   * a percentage is only sent under a name that says what it is (no bare "average score");
//   * the mixed "latest attempt" averages of the Knowledge awareness section are NOT sent: the pre-test mean,
//     post-test mean, gain and normalized gain in learningGain are the one measure.
import type { MaterialReachSummary } from './materialReach';
import { MIN_GROUP_SIZE } from './analyticsFilters';

export interface InsightPayloadInput {
  filtersActive: boolean;
  overview: {
    studentsMatchingTheFilters: number;
    guidancePrograms: number;
    activeSurveys: number;
    studentsWhoAnsweredAnAssessment: number;
    assessmentRecords: number;
    scoredAssessmentRecords: number;
    pwdStudents: number;
    ipStudents: number;
  };
  materials: {
    total: number;
    iec: number;
    iecCreatedThisMonth: number;
    createdThisMonth: number;
    createdThisYear: number;
    iecDownloads: number;
    downloadsFromThisMonthsUploads: number;
    iecByCategory: { category: string; count: number }[];
    byType: { name: string; value: number }[];
    byFormat: { name: string; value: number }[];
  };
  studentCounts: {
    byCourse: { course: string; count: number }[];
    byYearLevel: { year: string; count: number }[];
    byGender: { name: string; value: number }[];
    byAgeBand: { group: string; count: number }[];
    byCampus: { name: string; value: number }[];
  };
  programParticipationByCourse: { course: string; reached: number; notReached: number; total: number; reachedPct: number }[];
  materialReach: MaterialReachSummary | null;
}

export function buildInsightPayload(i: InsightPayloadInput): Record<string, unknown> {
  const reach = i.materialReach;
  return {
    overview: {
      studentsMatchingTheFilters: i.overview.studentsMatchingTheFilters,
      guidancePrograms: i.overview.guidancePrograms,
      activeSurveys: i.overview.activeSurveys,
      studentsWhoAnsweredAnAssessment: i.overview.studentsWhoAnsweredAnAssessment,
      assessmentRecords: i.overview.assessmentRecords,
      scoredAssessmentRecords: i.overview.scoredAssessmentRecords,
      assessmentRecordsNote:
        "These are RECORDS, not students: one record is one student's latest attempt at one assessment (the post-test when they took it, otherwise the pre-test).",
      pwdStudents: i.overview.pwdStudents,
      ipStudents: i.overview.ipStudents,
      filtersActive: i.filtersActive,
      filtersNote: 'The learningGain and materialReach sections ignore the dashboard filters.',
    },
    materialsLibrary: {
      totalMaterials: i.materials.total,
      totalIecMaterials: i.materials.iec,
      iecMaterialsCreatedThisMonth: i.materials.iecCreatedThisMonth,
      materialsCreatedThisMonth: i.materials.createdThisMonth,
      materialsCreatedThisYear: i.materials.createdThisYear,
      totalIecDownloads: i.materials.iecDownloads,
      downloadsOfThisMonthsUploads: i.materials.downloadsFromThisMonthsUploads,
      iecMaterialsByCategory: i.materials.iecByCategory.map((r) => ({ category: r.category, materials: r.count })),
      materialsByType: i.materials.byType.map((r) => ({ type: r.name, materials: r.value })),
      materialsByFormat: i.materials.byFormat.map((r) => ({ format: r.name, materials: r.value })),
    },
    studentCounts: {
      note: 'Numbers of STUDENTS with a profile, under the dashboard filters.',
      byCourse: i.studentCounts.byCourse.map((r) => ({ course: r.course, students: r.count })),
      byYearLevel: i.studentCounts.byYearLevel.map((r) => ({ yearLevel: r.year, students: r.count })),
      byGender: i.studentCounts.byGender.map((r) => ({ gender: r.name, students: r.value })),
      byAgeBand: i.studentCounts.byAgeBand.map((r) => ({ ageBand: r.group, students: r.count })),
      byCampus: i.studentCounts.byCampus.map((r) => ({ campus: r.name, students: r.value })),
    },
    programParticipationByCourse: {
      note: 'STUDENTS who answered a question about joining a guidance program, by course.',
      rows: i.programParticipationByCourse.map((r) => ({
        course: r.course,
        studentsWhoReportedJoiningAProgram: r.reached,
        studentsWhoDidNot: r.notReached,
        studentsTotal: r.total,
        percentOfStudentsWhoReportedJoining: r.reachedPct,
      })),
    },
    knowledgeAssessment: {
      note:
        'Pre-test mean, post-test mean, gain and normalized gain are in learningGain. The page also shows averages of each student\'s latest attempt; they mix pre-tests and post-tests, so they are not sent.',
      scoredAssessmentRecords: i.overview.scoredAssessmentRecords,
    },
    // learningGain is added by the server.
    materialReach: reach
      ? {
          about:
            'Share of STUDENTS who opened at least one linked IEC material, by course. Views were only recorded since materials were linked to programs, so earlier students may be understated. Ignores the dashboard filters (all programs, test accounts left out).',
          denominator: `${reach.overall.students} students with an account in the system (not total enrollment, and not only students who took a test)`,
          studentsWithAnAccount: reach.overall.students,
          studentsWhoOpenedAtLeastOneLinkedMaterial: reach.overall.reached,
          percentOfStudentsWithAnAccountWhoOpenedAtLeastOne: reach.overall.pct,
          byCourse: reach.by_course.map((row) => ({
            course: row.key,
            studentsWithAnAccount: row.students,
            studentsWhoOpenedAtLeastOne: row.reached,
            percentOfStudentsWhoOpened: row.pct,
            smallGroup: row.students < MIN_GROUP_SIZE,
            basedOnStudents: row.students,
          })),
        }
      : { unavailable: true },
  };
}
