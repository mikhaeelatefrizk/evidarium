// Shared, non-AI review contract. These fields collect a plan, not a quality score.
export const PROTOCOL_FIELDS = [
 ['question','Review question','سؤال المراجعة'],
 ['population','Population / setting','المشاركون والسياق'],
 ['intervention','Intervention / exposure','التدخل أو التعرض'],
 ['comparator','Comparator','المقارنة'],
 ['outcomes','Outcomes and time points','النتائج وأوقات قياسها'],
 ['designs','Eligible study designs','تصميمات الدراسات المقبولة'],
 ['eligibility','Inclusion and exclusion criteria','معايير الإدراج والاستبعاد'],
 ['databases','Databases and other sources','قواعد البيانات والمصادر الأخرى'],
 ['searchStrategy','Search strategies, dates and restrictions','استراتيجيات البحث وتواريخه وقيوده'],
 ['screening','Screening and disagreement plan','خطة الفرز وحل الاختلافات'],
 ['extraction','Data extraction and checking plan','خطة استخلاص البيانات ومراجعتها'],
 ['bias','Risk-of-bias assessment plan','خطة تقييم خطر التحيز'],
 ['synthesis','Synthesis, effect measures and heterogeneity','خطة التوليف ومقاييس الأثر والتغاير'],
 ['registration','Registration status and identifier','حالة التسجيل ومعرّفه'],
];
export const REVIEW_LIMITS = {studies:200,extractions:500,characters:300000,revisions:30};
export function emptyReview(){return {protocol:Object.fromEntries(PROTOCOL_FIELDS.map(([key])=>[key,''])),studies:[],extractions:[]};}
export function reviewReadiness(data,sources=[]){
 const linked=new Set(data.studies.flatMap(s=>s.sourceIds));
 return {missingProtocolFields:PROTOCOL_FIELDS.filter(([key])=>!data.protocol[key]?.trim()).map(([key])=>key),
  unlinkedRecords:sources.filter(s=>!linked.has(s.id)).length,
  studiesWithoutData:data.studies.filter(s=>!data.extractions.some(e=>e.studyId===s.id)).length,
  studyCount:data.studies.length,linkedReports:linked.size,extractionCount:data.extractions.length,
  unreviewedExtractions:data.extractions.filter(e=>e.reviewStatus!=='checked').length};
}
