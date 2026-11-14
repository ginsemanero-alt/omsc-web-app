import { adminPost } from './retention';

// The student-level paired t-test for the Learning gain card (one averaged pre/post pair per student, so n is the
// number of students). Worked out on the server, under the same filters as the card; see api/insightLearningGain.js.
export interface StudentLevelTest {
  students: number;
  matchedRecords: number;
  studentLevelMeans: { preTestMeanPercent: number; postTestMeanPercent: number; gainPoints: number } | null;
  pairedTTest: { students: number; t: number; df: number; pValue: string; significantAtP05: boolean } | null;
}

// params: the same object the card sends to learning_gain_summary (buildLearningGainParams).
export async function fetchStudentLevelTest(params: Record<string, unknown>): Promise<StudentLevelTest | null> {
  try {
    return await adminPost<StudentLevelTest>('/api/admin/learning-gain-students', params);
  } catch {
    return null; // the card then says the test is unavailable; it never falls back to the record-level test
  }
}
