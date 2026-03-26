import type { PortalLocale } from './portal-translations'

// ============================================================================
// Kiosk Translations  -  Multi-Language Support for Lobby Check-In Kiosk
// ============================================================================
// Covers all client-facing strings in the kiosk flow.
// Initial release: English, French, Spanish, Arabic.
// Remaining locales fall back to English.
// ============================================================================

export interface KioskTranslations {
  // Welcome screen
  welcome_title: string
  welcome_touch_to_begin: string
  welcome_select_language: string

  // Search screen
  search_title: string
  search_subtitle: string
  search_by_name: string
  search_by_email: string
  search_by_phone: string
  search_placeholder_name: string
  search_placeholder_email: string
  search_placeholder_phone: string
  search_button: string
  search_no_results: string
  search_no_results_hint: string
  search_walk_in: string
  search_select_appointment: string

  // Verify screen
  verify_title: string
  verify_subtitle: string
  verify_month: string
  verify_day: string
  verify_year: string
  verify_button: string
  verify_skip: string
  verify_error_mismatch: string
  verify_error_locked: string

  // Questions screen
  questions_title: string
  questions_subtitle: string
  questions_continue: string
  questions_back: string
  questions_additional_comments: string
  questions_additional_placeholder: string
  questions_yes: string
  questions_no: string
  questions_required: string

  // Data safety
  data_safety_title: string
  data_safety_acknowledge: string
  data_safety_continue: string
  data_safety_skip: string

  // ID Scan
  id_scan_title: string
  id_scan_camera: string
  id_scan_upload: string
  id_scan_skip: string
  id_scan_retake: string
  id_scan_confirm: string

  // Completing
  completing_message: string

  // Confirmation
  confirmation_title: string
  confirmation_thank_you: string
  confirmation_take_seat: string
  confirmation_seen_by: string
  confirmation_last_seen_by: string
  confirmation_lawyer_shortly: string

  // Walk-in info
  walkin_title: string
  walkin_subtitle: string
  walkin_name: string
  walkin_name_placeholder: string
  walkin_email: string
  walkin_email_placeholder: string
  walkin_phone: string
  walkin_phone_placeholder: string

  // Step labels
  step_find: string
  step_verify: string
  step_info: string
  step_questions: string
  step_id_scan: string
  step_done: string

  // Returning client flow
  returning_client_button: string
  returning_client_title: string
  returning_client_subtitle: string
  returning_client_by_email: string
  returning_client_by_phone: string
  returning_client_placeholder_email: string
  returning_client_placeholder_phone: string
  returning_client_not_found: string
  returning_client_not_found_hint: string
  returning_client_portal_title: string
  returning_client_book_apt: string
  returning_client_quick_checkin: string
  returning_client_quick_checkin_desc: string
  returning_client_pending_docs: string
  returning_client_pending_tasks: string
  returning_client_no_matters: string
  returning_client_no_matters_hint: string
}

// ─── English (base) ──────────────────────────────────────────────────────────

const en: KioskTranslations = {
  welcome_title: 'Welcome',
  welcome_touch_to_begin: 'Touch to Begin',
  welcome_select_language: 'Select Language',

  search_title: 'Find Your Appointment',
  search_subtitle: 'Search by your name, email, or phone number.',
  search_by_name: 'Name',
  search_by_email: 'Email',
  search_by_phone: 'Phone',
  search_placeholder_name: 'Enter your full name',
  search_placeholder_email: 'Enter your email address',
  search_placeholder_phone: 'Enter your phone number',
  search_button: 'Search',
  search_no_results: 'No appointments found.',
  search_no_results_hint: 'Try a different search or check in as a walk-in.',
  search_walk_in: "I don't have an appointment (Walk-in)",
  search_select_appointment: 'Select',

  verify_title: 'Verify Your Identity',
  verify_subtitle: 'Please enter your date of birth to continue.',
  verify_month: 'Month',
  verify_day: 'Day',
  verify_year: 'Year',
  verify_button: 'Verify & Continue',
  verify_skip: 'Skip',
  verify_error_mismatch: 'Date of birth does not match our records.',
  verify_error_locked: 'Too many failed attempts. Please see the front desk.',

  questions_title: 'A Few Quick Questions',
  questions_subtitle: 'Please help us prepare for your visit.',
  questions_continue: 'Continue',
  questions_back: 'Back',
  questions_additional_comments: 'Additional Comments',
  questions_additional_placeholder: 'Anything else you\'d like us to know?',
  questions_yes: 'Yes',
  questions_no: 'No',
  questions_required: 'Required',

  data_safety_title: 'Data Safety Notice',
  data_safety_acknowledge: 'I have read and understand this notice',
  data_safety_continue: 'Continue',
  data_safety_skip: 'Skip ID Scan',

  id_scan_title: 'Scan Your ID',
  id_scan_camera: 'Take a Photo',
  id_scan_upload: 'Upload a File',
  id_scan_skip: 'Skip',
  id_scan_retake: 'Retake',
  id_scan_confirm: 'Confirm & Upload',

  completing_message: 'Completing check-in...',

  confirmation_title: "You're All Checked In!",
  confirmation_thank_you: 'Thank you, {name}.',
  confirmation_take_seat: 'Please take a seat in the waiting area.',
  confirmation_seen_by: "You'll be seen by {name}",
  confirmation_last_seen_by: 'You were last seen by {name}',
  confirmation_lawyer_shortly: 'Your lawyer will be with you shortly.',

  walkin_title: 'Your Information',
  walkin_subtitle: 'Please provide your details so we can assist you.',
  walkin_name: 'Full Name',
  walkin_name_placeholder: 'Enter your full name',
  walkin_email: 'Email Address',
  walkin_email_placeholder: 'Enter your email address',
  walkin_phone: 'Phone Number',
  walkin_phone_placeholder: 'Enter your phone number',

  step_find: 'Find',
  step_verify: 'Verify',
  step_info: 'Info',
  step_questions: 'Questions',
  step_id_scan: 'ID Scan',
  step_done: 'Done',

  returning_client_button: 'Return Client  -  No Appointment',
  returning_client_title: 'Welcome Back',
  returning_client_subtitle: 'Search by your email or phone number to view your file.',
  returning_client_by_email: 'Email',
  returning_client_by_phone: 'Phone',
  returning_client_placeholder_email: 'Enter your email address',
  returning_client_placeholder_phone: 'Enter your phone number',
  returning_client_not_found: 'No active file found.',
  returning_client_not_found_hint: 'Please see the front desk for assistance.',
  returning_client_portal_title: 'Your File',
  returning_client_book_apt: 'Book an Appointment',
  returning_client_quick_checkin: 'Quick Check-In (5 min)',
  returning_client_quick_checkin_desc: "Let us know you're here  -  a team member will be with you shortly.",
  returning_client_pending_docs: '{count} document(s) pending upload',
  returning_client_pending_tasks: '{count} action(s) to complete',
  returning_client_no_matters: 'No active matter on file.',
  returning_client_no_matters_hint: 'Please see the front desk for assistance.',
}

// ─── French ──────────────────────────────────────────────────────────────────

const fr: KioskTranslations = {
  welcome_title: 'Bienvenue',
  welcome_touch_to_begin: 'Touchez pour commencer',
  welcome_select_language: 'Choisir la langue',

  search_title: 'Trouvez votre rendez-vous',
  search_subtitle: 'Recherchez par nom, courriel ou numéro de téléphone.',
  search_by_name: 'Nom',
  search_by_email: 'Courriel',
  search_by_phone: 'Téléphone',
  search_placeholder_name: 'Entrez votre nom complet',
  search_placeholder_email: 'Entrez votre adresse courriel',
  search_placeholder_phone: 'Entrez votre numéro de téléphone',
  search_button: 'Rechercher',
  search_no_results: 'Aucun rendez-vous trouvé.',
  search_no_results_hint: 'Essayez une autre recherche ou présentez-vous sans rendez-vous.',
  search_walk_in: "Je n'ai pas de rendez-vous (Sans rendez-vous)",
  search_select_appointment: 'Sélectionner',

  verify_title: 'Vérifiez votre identité',
  verify_subtitle: 'Veuillez entrer votre date de naissance pour continuer.',
  verify_month: 'Mois',
  verify_day: 'Jour',
  verify_year: 'Année',
  verify_button: 'Vérifier et continuer',
  verify_skip: 'Passer',
  verify_error_mismatch: 'La date de naissance ne correspond pas à nos dossiers.',
  verify_error_locked: 'Trop de tentatives échouées. Veuillez vous adresser à la réception.',

  questions_title: 'Quelques questions rapides',
  questions_subtitle: 'Aidez-nous à préparer votre visite.',
  questions_continue: 'Continuer',
  questions_back: 'Retour',
  questions_additional_comments: 'Commentaires supplémentaires',
  questions_additional_placeholder: 'Y a-t-il autre chose que vous aimeriez nous dire?',
  questions_yes: 'Oui',
  questions_no: 'Non',
  questions_required: 'Obligatoire',

  data_safety_title: 'Avis de protection des données',
  data_safety_acknowledge: "J'ai lu et compris cet avis",
  data_safety_continue: 'Continuer',
  data_safety_skip: "Passer la numérisation d'identité",

  id_scan_title: 'Numérisez votre pièce d\'identité',
  id_scan_camera: 'Prendre une photo',
  id_scan_upload: 'Téléverser un fichier',
  id_scan_skip: 'Passer',
  id_scan_retake: 'Reprendre',
  id_scan_confirm: 'Confirmer et téléverser',

  completing_message: 'Enregistrement en cours...',

  confirmation_title: 'Vous êtes enregistré!',
  confirmation_thank_you: 'Merci, {name}.',
  confirmation_take_seat: 'Veuillez prendre place dans la salle d\'attente.',
  confirmation_seen_by: 'Vous serez reçu par {name}',
  confirmation_last_seen_by: 'Vous avez été reçu la dernière fois par {name}',
  confirmation_lawyer_shortly: 'Votre avocat vous recevra sous peu.',

  walkin_title: 'Vos informations',
  walkin_subtitle: 'Veuillez fournir vos coordonnées pour que nous puissions vous aider.',
  walkin_name: 'Nom complet',
  walkin_name_placeholder: 'Entrez votre nom complet',
  walkin_email: 'Adresse courriel',
  walkin_email_placeholder: 'Entrez votre adresse courriel',
  walkin_phone: 'Numéro de téléphone',
  walkin_phone_placeholder: 'Entrez votre numéro de téléphone',

  step_find: 'Recherche',
  step_verify: 'Vérification',
  step_info: 'Infos',
  step_questions: 'Questions',
  step_id_scan: 'Identité',
  step_done: 'Terminé',

  returning_client_button: 'Client de retour  -  Sans rendez-vous',
  returning_client_title: 'Bon retour',
  returning_client_subtitle: 'Recherchez par courriel ou téléphone pour consulter votre dossier.',
  returning_client_by_email: 'Courriel',
  returning_client_by_phone: 'Téléphone',
  returning_client_placeholder_email: 'Entrez votre adresse courriel',
  returning_client_placeholder_phone: 'Entrez votre numéro de téléphone',
  returning_client_not_found: 'Aucun dossier actif trouvé.',
  returning_client_not_found_hint: 'Veuillez vous adresser à la réception.',
  returning_client_portal_title: 'Votre dossier',
  returning_client_book_apt: 'Prendre un rendez-vous',
  returning_client_quick_checkin: 'Enregistrement rapide (5 min)',
  returning_client_quick_checkin_desc: "Faites-nous savoir que vous êtes là  -  un membre de l'équipe sera avec vous sous peu.",
  returning_client_pending_docs: '{count} document(s) en attente de téléversement',
  returning_client_pending_tasks: '{count} action(s) à compléter',
  returning_client_no_matters: 'Aucun dossier actif au registre.',
  returning_client_no_matters_hint: 'Veuillez vous adresser à la réception.',
}

// ─── Spanish ─────────────────────────────────────────────────────────────────

const es: KioskTranslations = {
  welcome_title: 'Bienvenido',
  welcome_touch_to_begin: 'Toque para comenzar',
  welcome_select_language: 'Seleccionar idioma',

  search_title: 'Encuentre su cita',
  search_subtitle: 'Busque por nombre, correo electrónico o número de teléfono.',
  search_by_name: 'Nombre',
  search_by_email: 'Correo',
  search_by_phone: 'Teléfono',
  search_placeholder_name: 'Ingrese su nombre completo',
  search_placeholder_email: 'Ingrese su correo electrónico',
  search_placeholder_phone: 'Ingrese su número de teléfono',
  search_button: 'Buscar',
  search_no_results: 'No se encontraron citas.',
  search_no_results_hint: 'Intente otra búsqueda o regístrese como visitante sin cita.',
  search_walk_in: 'No tengo cita (Sin cita previa)',
  search_select_appointment: 'Seleccionar',

  verify_title: 'Verifique su identidad',
  verify_subtitle: 'Ingrese su fecha de nacimiento para continuar.',
  verify_month: 'Mes',
  verify_day: 'Día',
  verify_year: 'Año',
  verify_button: 'Verificar y continuar',
  verify_skip: 'Omitir',
  verify_error_mismatch: 'La fecha de nacimiento no coincide con nuestros registros.',
  verify_error_locked: 'Demasiados intentos fallidos. Por favor, diríjase a la recepción.',

  questions_title: 'Algunas preguntas rápidas',
  questions_subtitle: 'Ayúdenos a preparar su visita.',
  questions_continue: 'Continuar',
  questions_back: 'Atrás',
  questions_additional_comments: 'Comentarios adicionales',
  questions_additional_placeholder: '¿Hay algo más que le gustaría que supiéramos?',
  questions_yes: 'Sí',
  questions_no: 'No',
  questions_required: 'Obligatorio',

  data_safety_title: 'Aviso de seguridad de datos',
  data_safety_acknowledge: 'He leído y entiendo este aviso',
  data_safety_continue: 'Continuar',
  data_safety_skip: 'Omitir escaneo de identidad',

  id_scan_title: 'Escanee su identificación',
  id_scan_camera: 'Tomar una foto',
  id_scan_upload: 'Subir un archivo',
  id_scan_skip: 'Omitir',
  id_scan_retake: 'Repetir',
  id_scan_confirm: 'Confirmar y subir',

  completing_message: 'Completando el registro...',

  confirmation_title: '¡Registro completado!',
  confirmation_thank_you: 'Gracias, {name}.',
  confirmation_take_seat: 'Por favor, tome asiento en la sala de espera.',
  confirmation_seen_by: 'Será atendido por {name}',
  confirmation_last_seen_by: 'La última vez fue atendido por {name}',
  confirmation_lawyer_shortly: 'Su abogado estará con usted en breve.',

  walkin_title: 'Su información',
  walkin_subtitle: 'Proporcione sus datos para que podamos asistirle.',
  walkin_name: 'Nombre completo',
  walkin_name_placeholder: 'Ingrese su nombre completo',
  walkin_email: 'Correo electrónico',
  walkin_email_placeholder: 'Ingrese su correo electrónico',
  walkin_phone: 'Número de teléfono',
  walkin_phone_placeholder: 'Ingrese su número de teléfono',

  step_find: 'Buscar',
  step_verify: 'Verificar',
  step_info: 'Datos',
  step_questions: 'Preguntas',
  step_id_scan: 'Identidad',
  step_done: 'Listo',

  returning_client_button: 'Cliente anterior  -  Sin cita',
  returning_client_title: 'Bienvenido de nuevo',
  returning_client_subtitle: 'Busque por correo o teléfono para ver su expediente.',
  returning_client_by_email: 'Correo',
  returning_client_by_phone: 'Teléfono',
  returning_client_placeholder_email: 'Ingrese su correo electrónico',
  returning_client_placeholder_phone: 'Ingrese su número de teléfono',
  returning_client_not_found: 'No se encontró ningún expediente activo.',
  returning_client_not_found_hint: 'Por favor, diríjase a la recepción.',
  returning_client_portal_title: 'Su expediente',
  returning_client_book_apt: 'Reservar una cita',
  returning_client_quick_checkin: 'Registro rápido (5 min)',
  returning_client_quick_checkin_desc: 'Háganos saber que está aquí  -  un miembro del equipo le atenderá en breve.',
  returning_client_pending_docs: '{count} documento(s) pendiente(s) de carga',
  returning_client_pending_tasks: '{count} acción(es) por completar',
  returning_client_no_matters: 'No hay expediente activo en el sistema.',
  returning_client_no_matters_hint: 'Por favor, diríjase a la recepción.',
}

// ─── Arabic ──────────────────────────────────────────────────────────────────

const ar: KioskTranslations = {
  welcome_title: 'مرحباً',
  welcome_touch_to_begin: 'المس للبدء',
  welcome_select_language: 'اختر اللغة',

  search_title: 'ابحث عن موعدك',
  search_subtitle: 'ابحث بالاسم أو البريد الإلكتروني أو رقم الهاتف.',
  search_by_name: 'الاسم',
  search_by_email: 'البريد',
  search_by_phone: 'الهاتف',
  search_placeholder_name: 'أدخل اسمك الكامل',
  search_placeholder_email: 'أدخل بريدك الإلكتروني',
  search_placeholder_phone: 'أدخل رقم هاتفك',
  search_button: 'بحث',
  search_no_results: 'لم يتم العثور على مواعيد.',
  search_no_results_hint: 'جرّب بحثاً آخر أو سجّل كزائر بدون موعد.',
  search_walk_in: 'ليس لدي موعد (زيارة بدون موعد)',
  search_select_appointment: 'اختيار',

  verify_title: 'تحقق من هويتك',
  verify_subtitle: 'يرجى إدخال تاريخ ميلادك للمتابعة.',
  verify_month: 'الشهر',
  verify_day: 'اليوم',
  verify_year: 'السنة',
  verify_button: 'تحقق واستمر',
  verify_skip: 'تخطي',
  verify_error_mismatch: 'تاريخ الميلاد لا يتطابق مع سجلاتنا.',
  verify_error_locked: 'محاولات فاشلة كثيرة. يرجى التوجه إلى مكتب الاستقبال.',

  questions_title: 'بعض الأسئلة السريعة',
  questions_subtitle: 'ساعدنا في التحضير لزيارتك.',
  questions_continue: 'متابعة',
  questions_back: 'رجوع',
  questions_additional_comments: 'تعليقات إضافية',
  questions_additional_placeholder: 'هل هناك شيء آخر تودّ إخبارنا به؟',
  questions_yes: 'نعم',
  questions_no: 'لا',
  questions_required: 'مطلوب',

  data_safety_title: 'إشعار أمان البيانات',
  data_safety_acknowledge: 'لقد قرأت وفهمت هذا الإشعار',
  data_safety_continue: 'متابعة',
  data_safety_skip: 'تخطي مسح الهوية',

  id_scan_title: 'امسح هويتك',
  id_scan_camera: 'التقاط صورة',
  id_scan_upload: 'رفع ملف',
  id_scan_skip: 'تخطي',
  id_scan_retake: 'إعادة التقاط',
  id_scan_confirm: 'تأكيد ورفع',

  completing_message: 'جارٍ إتمام التسجيل...',

  confirmation_title: 'تم تسجيل وصولك!',
  confirmation_thank_you: 'شكراً لك، {name}.',
  confirmation_take_seat: 'يرجى الجلوس في منطقة الانتظار.',
  confirmation_seen_by: 'سيستقبلك {name}',
  confirmation_last_seen_by: 'آخر مرة تمت مقابلتك بواسطة {name}',
  confirmation_lawyer_shortly: 'سيكون محاميك معك قريباً.',

  walkin_title: 'معلوماتك',
  walkin_subtitle: 'يرجى تقديم بياناتك حتى نتمكن من مساعدتك.',
  walkin_name: 'الاسم الكامل',
  walkin_name_placeholder: 'أدخل اسمك الكامل',
  walkin_email: 'البريد الإلكتروني',
  walkin_email_placeholder: 'أدخل بريدك الإلكتروني',
  walkin_phone: 'رقم الهاتف',
  walkin_phone_placeholder: 'أدخل رقم هاتفك',

  step_find: 'بحث',
  step_verify: 'تحقق',
  step_info: 'بيانات',
  step_questions: 'أسئلة',
  step_id_scan: 'الهوية',
  step_done: 'تم',

  returning_client_button: 'عميل عائد  -  بدون موعد',
  returning_client_title: 'أهلاً بعودتك',
  returning_client_subtitle: 'ابحث بالبريد الإلكتروني أو الهاتف للوصول إلى ملفك.',
  returning_client_by_email: 'البريد',
  returning_client_by_phone: 'الهاتف',
  returning_client_placeholder_email: 'أدخل بريدك الإلكتروني',
  returning_client_placeholder_phone: 'أدخل رقم هاتفك',
  returning_client_not_found: 'لم يتم العثور على ملف نشط.',
  returning_client_not_found_hint: 'يرجى التوجه إلى مكتب الاستقبال.',
  returning_client_portal_title: 'ملفك',
  returning_client_book_apt: 'حجز موعد',
  returning_client_quick_checkin: 'تسجيل سريع (5 دقائق)',
  returning_client_quick_checkin_desc: 'أعلمنا بوصولك  -  سيكون أحد أعضاء الفريق معك قريباً.',
  returning_client_pending_docs: '{count} وثيقة/وثائق بانتظار الرفع',
  returning_client_pending_tasks: '{count} إجراء/إجراءات للإكمال',
  returning_client_no_matters: 'لا يوجد ملف نشط في النظام.',
  returning_client_no_matters_hint: 'يرجى التوجه إلى مكتب الاستقبال.',
}

// ─── Locale Map ──────────────────────────────────────────────────────────────

const translations: Partial<Record<PortalLocale, KioskTranslations>> = {
  en,
  fr,
  es,
  ar,
}

/**
 * Get kiosk UI translations for a given locale.
 * Falls back to English for any unsupported locale.
 */
export function getKioskTranslations(locale: PortalLocale): KioskTranslations {
  return translations[locale] ?? en
}

/**
 * Interpolate a translation string with named placeholders.
 * e.g. interpolate('Thank you, {name}.', { name: 'John' }) → 'Thank you, John.'
 */
export function interpolate(template: string, vars: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (_, key) => vars[key] ?? `{${key}}`)
}
