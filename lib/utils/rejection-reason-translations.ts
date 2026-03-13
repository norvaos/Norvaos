// ============================================================================
// Rejection Reason Translations
// ============================================================================
// Client-facing translations for document rejection reasons shown in the
// client portal. Each reason has a label, actionable guidance, and a tip.
// Covers all 20 portal locales with graceful fallback to English.
// ============================================================================

import type { PortalLocale } from './portal-translations'

export type RejectionReasonCode =
  | 'blurry'
  | 'corner_cut'
  | 'not_readable'
  | 'needs_translation'
  | 'wrong_document'
  | 'expired'
  | 'incomplete'
  | 'other'

export interface RejectionReasonInfo {
  /** Short label shown as the rejection heading */
  label: string
  /** Step-by-step guidance on how to fix the issue */
  guidance: string
  /** Best practice tip */
  tip: string
}

type RejectionTranslationMap = Record<RejectionReasonCode, RejectionReasonInfo>

// ─── English (base) ──────────────────────────────────────────────────────────

const en: RejectionTranslationMap = {
  blurry: {
    label: 'Document is blurry or out of focus',
    guidance:
      'Please take a new photo or scan. Hold the camera steady, make sure the document is flat, and ensure all text is sharp and clearly visible.',
    tip: 'Use natural daylight or a well-lit room. Avoid flash glare by positioning the camera directly above the document.',
  },
  corner_cut: {
    label: 'Corners or edges are cut off',
    guidance:
      'Please retake the photo so that all four corners of the document are fully visible within the frame. Do not crop or zoom in too closely.',
    tip: 'Place the document on a dark background — this makes it easier to see all edges and frame the photo correctly.',
  },
  not_readable: {
    label: 'Text is not readable',
    guidance:
      'Please upload a clearer copy where all text and numbers can be easily read. Use a higher resolution setting on your scanner or camera.',
    tip: 'A flatbed scanner typically produces a clearer result than a phone camera for text-heavy documents.',
  },
  needs_translation: {
    label: 'Certified translation required',
    guidance:
      'This document is not in English or French. Please obtain a certified translation from a professional translator and upload both the original document and the translation together.',
    tip: 'In Canada, certified translators must be members of a recognised provincial association (e.g. ATIO in Ontario, OTTIAQ in Québec). Ask your translator for a signed certificate of accuracy.',
  },
  wrong_document: {
    label: 'Wrong document uploaded',
    guidance:
      'The document you uploaded does not match what was requested. Please check the document title shown above and upload the correct document.',
    tip: 'If you are unsure which document is needed, contact your legal representative before re-uploading.',
  },
  expired: {
    label: 'Document has expired',
    guidance:
      'The expiry date on this document has passed. Please obtain a current, valid version from the issuing authority and upload it.',
    tip: 'Ensure the renewal is complete and the expiry date on the new document is clearly visible before uploading.',
  },
  incomplete: {
    label: 'Document is incomplete or missing pages',
    guidance:
      'The document appears to be missing pages or required sections. Please upload the complete document including all pages.',
    tip: 'If your document has multiple pages, use the "Combine pages" option in the upload screen to merge them into a single file before submitting.',
  },
  other: {
    label: 'Additional information required',
    guidance:
      'Please review the note from your legal team above and upload a corrected version of the document.',
    tip: 'Contact your legal representative if you have questions about what is required.',
  },
}

// ─── French ──────────────────────────────────────────────────────────────────

const fr: RejectionTranslationMap = {
  blurry: {
    label: 'Document flou ou hors de mise au point',
    guidance:
      "Veuillez prendre une nouvelle photo ou numérisation. Tenez l'appareil bien stable, assurez-vous que le document est à plat et que tout le texte est net et clairement visible.",
    tip: "Utilisez la lumière naturelle ou une pièce bien éclairée. Évitez le flash en positionnant l'appareil directement au-dessus du document.",
  },
  corner_cut: {
    label: 'Coins ou bords rognés',
    guidance:
      'Veuillez reprendre la photo pour que les quatre coins du document soient entièrement visibles dans le cadre. Ne recadrez pas trop près.',
    tip: "Placez le document sur un fond sombre — cela facilite la vision de tous les bords et le cadrage correct de la photo.",
  },
  not_readable: {
    label: 'Texte illisible',
    guidance:
      "Veuillez télécharger une copie plus nette où tout le texte et les chiffres peuvent être facilement lus. Utilisez une résolution plus élevée sur votre scanner ou appareil photo.",
    tip: 'Un scanner à plat produit généralement un résultat plus net qu\'un appareil photo pour les documents contenant beaucoup de texte.',
  },
  needs_translation: {
    label: 'Traduction certifiée requise',
    guidance:
      "Ce document n'est pas en anglais ou en français. Veuillez obtenir une traduction certifiée d'un traducteur professionnel et télécharger le document original ainsi que la traduction.",
    tip: "Au Canada, les traducteurs certifiés doivent être membres d'une association provinciale reconnue (p. ex. ATIO en Ontario, OTTIAQ au Québec). Demandez à votre traducteur un certificat d'exactitude signé.",
  },
  wrong_document: {
    label: 'Mauvais document téléchargé',
    guidance:
      "Le document que vous avez téléchargé ne correspond pas à ce qui était demandé. Veuillez vérifier le titre du document indiqué ci-dessus et télécharger le document correct.",
    tip: "Si vous n'êtes pas sûr du document requis, contactez votre représentant juridique avant de télécharger à nouveau.",
  },
  expired: {
    label: 'Document expiré',
    guidance:
      "La date d'expiration de ce document est dépassée. Veuillez obtenir une version actuelle et valide auprès de l'autorité émettrice et la télécharger.",
    tip: "Assurez-vous que le renouvellement est terminé et que la date d'expiration du nouveau document est clairement visible avant de télécharger.",
  },
  incomplete: {
    label: 'Document incomplet ou pages manquantes',
    guidance:
      "Le document semble manquer de pages ou de sections requises. Veuillez télécharger le document complet, y compris toutes les pages.",
    tip: "Si votre document comporte plusieurs pages, utilisez l'option « Combiner les pages » dans l'écran de téléchargement pour les fusionner en un seul fichier avant de soumettre.",
  },
  other: {
    label: 'Informations supplémentaires requises',
    guidance:
      "Veuillez consulter la note de votre équipe juridique ci-dessus et télécharger une version corrigée du document.",
    tip: "Contactez votre représentant juridique si vous avez des questions sur ce qui est requis.",
  },
}

// ─── Spanish ─────────────────────────────────────────────────────────────────

const es: RejectionTranslationMap = {
  blurry: {
    label: 'El documento está borroso o desenfocado',
    guidance:
      'Por favor, tome una nueva foto o escaneo. Mantenga la cámara estable, asegúrese de que el documento esté plano y que todo el texto sea nítido y claramente visible.',
    tip: 'Use luz natural o una habitación bien iluminada. Evite el destello del flash posicionando la cámara directamente sobre el documento.',
  },
  corner_cut: {
    label: 'Las esquinas o bordes están cortados',
    guidance:
      'Por favor, retome la foto para que las cuatro esquinas del documento sean completamente visibles dentro del encuadre. No recorte ni haga demasiado zoom.',
    tip: 'Coloque el documento sobre un fondo oscuro: esto facilita ver todos los bordes y enmarcar la foto correctamente.',
  },
  not_readable: {
    label: 'El texto no es legible',
    guidance:
      'Por favor, suba una copia más clara donde todo el texto y los números puedan leerse fácilmente. Use una resolución más alta en su escáner o cámara.',
    tip: 'Un escáner de cama plana generalmente produce un resultado más claro que una cámara de teléfono para documentos con mucho texto.',
  },
  needs_translation: {
    label: 'Se requiere traducción certificada',
    guidance:
      'Este documento no está en inglés ni en francés. Por favor, obtenga una traducción certificada de un traductor profesional y suba tanto el documento original como la traducción.',
    tip: 'Pida a su traductor un certificado de exactitud firmado.',
  },
  wrong_document: {
    label: 'Se subió el documento incorrecto',
    guidance:
      'El documento que subió no corresponde a lo solicitado. Por favor, verifique el título del documento que aparece arriba y suba el documento correcto.',
    tip: 'Si no está seguro de qué documento se necesita, contacte a su representante legal antes de volver a subir.',
  },
  expired: {
    label: 'El documento ha expirado',
    guidance:
      'La fecha de vencimiento de este documento ha pasado. Por favor, obtenga una versión vigente y válida de la autoridad emisora y súbala.',
    tip: 'Asegúrese de que la renovación esté completa y que la fecha de vencimiento del nuevo documento sea claramente visible antes de subir.',
  },
  incomplete: {
    label: 'El documento está incompleto o faltan páginas',
    guidance:
      'El documento parece tener páginas o secciones requeridas faltantes. Por favor, suba el documento completo incluyendo todas las páginas.',
    tip: 'Si su documento tiene varias páginas, use la opción "Combinar páginas" en la pantalla de carga para fusionarlas en un solo archivo antes de enviar.',
  },
  other: {
    label: 'Se requiere información adicional',
    guidance:
      'Por favor, revise la nota de su equipo legal arriba y suba una versión corregida del documento.',
    tip: 'Contacte a su representante legal si tiene preguntas sobre lo que se requiere.',
  },
}

// ─── Arabic ───────────────────────────────────────────────────────────────────

const ar: RejectionTranslationMap = {
  blurry: {
    label: 'المستند ضبابي أو غير واضح',
    guidance:
      'يرجى التقاط صورة أو إجراء مسح ضوئي جديد. أمسك الكاميرا بثبات وتأكد من أن المستند مسطح وأن جميع النصوص واضحة.',
    tip: 'استخدم الضوء الطبيعي أو غرفة جيدة الإضاءة. تجنب وميض الفلاش بوضع الكاميرا مباشرة فوق المستند.',
  },
  corner_cut: {
    label: 'الزوايا أو الحواف مقطوعة',
    guidance:
      'يرجى إعادة التقاط الصورة بحيث تكون الزوايا الأربع للمستند مرئية بالكامل. لا تقم بالاقتصاص أو التكبير الشديد.',
    tip: 'ضع المستند على خلفية داكنة لتسهيل رؤية جميع الحواف.',
  },
  not_readable: {
    label: 'النص غير مقروء',
    guidance:
      'يرجى تحميل نسخة أوضح حيث يمكن قراءة جميع النصوص والأرقام بسهولة. استخدم دقة أعلى على الماسح الضوئي أو الكاميرا.',
    tip: 'الماسح الضوئي المسطح يُنتج عادةً نتيجة أوضح من كاميرا الهاتف للمستندات التي تحتوي على نصوص كثيرة.',
  },
  needs_translation: {
    label: 'مطلوب ترجمة معتمدة',
    guidance:
      'هذه الوثيقة ليست باللغة الإنجليزية أو الفرنسية. يرجى الحصول على ترجمة معتمدة من مترجم محترف وتحميل المستند الأصلي والترجمة معًا.',
    tip: 'اطلب من المترجم شهادة دقة موقعة.',
  },
  wrong_document: {
    label: 'تم تحميل مستند خاطئ',
    guidance:
      'المستند الذي قمت بتحميله لا يتطابق مع ما تم طلبه. يرجى التحقق من عنوان المستند الموضح أعلاه وتحميل المستند الصحيح.',
    tip: 'إذا لم تكن متأكدًا من المستند المطلوب، اتصل بممثلك القانوني قبل إعادة التحميل.',
  },
  expired: {
    label: 'المستند منتهي الصلاحية',
    guidance:
      'تاريخ انتهاء صلاحية هذا المستند قد مضى. يرجى الحصول على نسخة حالية وصالحة من الجهة المصدرة وتحميلها.',
    tip: 'تأكد من اكتمال التجديد وأن تاريخ انتهاء الصلاحية في المستند الجديد مرئي بوضوح.',
  },
  incomplete: {
    label: 'المستند غير مكتمل أو تنقصه صفحات',
    guidance:
      'يبدو أن المستند ينقصه صفحات أو أقسام مطلوبة. يرجى تحميل المستند كاملاً بما في ذلك جميع الصفحات.',
    tip: 'إذا كان مستندك يحتوي على صفحات متعددة، استخدم خيار "دمج الصفحات" في شاشة التحميل لدمجها في ملف واحد.',
  },
  other: {
    label: 'مطلوب معلومات إضافية',
    guidance:
      'يرجى مراجعة الملاحظة من فريقك القانوني أعلاه وتحميل نسخة معدلة من المستند.',
    tip: 'تواصل مع ممثلك القانوني إذا كان لديك أسئلة حول ما هو مطلوب.',
  },
}

// ─── Chinese (Simplified) ─────────────────────────────────────────────────────

const zh: RejectionTranslationMap = {
  blurry: {
    label: '文件模糊或失焦',
    guidance: '请重新拍照或扫描。保持相机稳定，确保文件平放，所有文字清晰可见。',
    tip: '请在自然光或光线充足的房间内拍摄。将相机直接放在文件正上方以避免闪光灯眩光。',
  },
  corner_cut: {
    label: '边角或边缘被裁剪',
    guidance: '请重新拍照，确保文件的四个角都完全在画面内。不要过度裁剪或放大。',
    tip: '将文件放在深色背景上，这样更容易看清所有边缘并正确取景。',
  },
  not_readable: {
    label: '文字无法阅读',
    guidance: '请上传更清晰的副本，所有文字和数字都能轻松阅读。使用更高分辨率扫描或拍摄。',
    tip: '对于文字较多的文件，平板扫描仪通常比手机相机产生更清晰的结果。',
  },
  needs_translation: {
    label: '需要经认证的翻译',
    guidance: '此文件不是英文或法文。请获取专业翻译人员的认证翻译，并同时上传原件和译文。',
    tip: '请要求翻译人员提供签署的准确性证明。',
  },
  wrong_document: {
    label: '上传了错误的文件',
    guidance: '您上传的文件与所要求的不符。请查看上方显示的文件名称并上传正确的文件。',
    tip: '如果您不确定需要哪份文件，请在重新上传前联系您的法律代表。',
  },
  expired: {
    label: '文件已过期',
    guidance: '此文件的有效期已过。请向签发机构获取当前有效的版本并上传。',
    tip: '请确保续签完成，并且新文件上的到期日期清晰可见后再上传。',
  },
  incomplete: {
    label: '文件不完整或缺少页面',
    guidance: '文件似乎缺少页面或所需部分。请上传包含所有页面的完整文件。',
    tip: '如果您的文件有多页，请在上传屏幕中使用"合并页面"选项将其合并为一个文件后再提交。',
  },
  other: {
    label: '需要补充信息',
    guidance: '请查阅上方您法律团队的备注，并上传文件的更正版本。',
    tip: '如有关于所需内容的疑问，请联系您的法律代表。',
  },
}

// ─── Hindi ───────────────────────────────────────────────────────────────────

const hi: RejectionTranslationMap = {
  blurry: {
    label: 'दस्तावेज़ धुंधला या अस्पष्ट है',
    guidance:
      'कृपया नई फ़ोटो या स्कैन लें। कैमरा स्थिर रखें, सुनिश्चित करें कि दस्तावेज़ सपाट हो और सभी पाठ स्पष्ट रूप से दिखाई दे।',
    tip: 'प्राकृतिक प्रकाश या अच्छी रोशनी वाले कमरे का उपयोग करें। कैमरे को दस्तावेज़ के ठीक ऊपर रखकर फ्लैश की चकाचौंध से बचें।',
  },
  corner_cut: {
    label: 'कोने या किनारे कटे हुए हैं',
    guidance:
      'कृपया फ़ोटो को फिर से लें ताकि दस्तावेज़ के सभी चार कोने पूरी तरह से फ्रेम में दिखाई दें। बहुत अधिक क्रॉप या ज़ूम न करें।',
    tip: 'दस्तावेज़ को गहरे रंग की पृष्ठभूमि पर रखें — इससे सभी किनारे देखना और सही फ्रेम करना आसान हो जाता है।',
  },
  not_readable: {
    label: 'पाठ पढ़ा नहीं जा सकता',
    guidance:
      'कृपया एक स्पष्ट प्रति अपलोड करें जहाँ सभी पाठ और संख्याएँ आसानी से पढ़ी जा सकें। अपने स्कैनर या कैमरे पर उच्च रिज़ॉल्यूशन का उपयोग करें।',
    tip: 'पाठ-भारी दस्तावेज़ों के लिए फ्लैटबेड स्कैनर आमतौर पर फ़ोन कैमरे से बेहतर परिणाम देता है।',
  },
  needs_translation: {
    label: 'प्रमाणित अनुवाद आवश्यक है',
    guidance:
      'यह दस्तावेज़ अंग्रेजी या फ्रेंच में नहीं है। कृपया एक पेशेवर अनुवादक से प्रमाणित अनुवाद प्राप्त करें और मूल दस्तावेज़ और अनुवाद दोनों अपलोड करें।',
    tip: 'अनुवादक से हस्ताक्षरित सटीकता प्रमाण पत्र माँगें।',
  },
  wrong_document: {
    label: 'गलत दस्तावेज़ अपलोड किया गया',
    guidance:
      'आपने जो दस्तावेज़ अपलोड किया वह अनुरोधित दस्तावेज़ से मेल नहीं खाता। कृपया ऊपर दिखाए गए दस्तावेज़ के शीर्षक की जाँच करें और सही दस्तावेज़ अपलोड करें।',
    tip: 'यदि आप सुनिश्चित नहीं हैं कि कौन सा दस्तावेज़ चाहिए, तो पुनः अपलोड करने से पहले अपने कानूनी प्रतिनिधि से संपर्क करें।',
  },
  expired: {
    label: 'दस्तावेज़ की अवधि समाप्त हो गई है',
    guidance:
      'इस दस्तावेज़ की समाप्ति तिथि बीत चुकी है। कृपया जारीकर्ता प्राधिकरण से वर्तमान वैध संस्करण प्राप्त करें और अपलोड करें।',
    tip: 'अपलोड करने से पहले सुनिश्चित करें कि नवीनीकरण पूरा हो गया है और नए दस्तावेज़ पर समाप्ति तिथि स्पष्ट रूप से दिखाई दे।',
  },
  incomplete: {
    label: 'दस्तावेज़ अधूरा है या पृष्ठ गायब हैं',
    guidance:
      'दस्तावेज़ में पृष्ठ या आवश्यक अनुभाग गायब प्रतीत होते हैं। कृपया सभी पृष्ठों सहित पूर्ण दस्तावेज़ अपलोड करें।',
    tip: 'यदि आपके दस्तावेज़ में कई पृष्ठ हैं, तो सबमिट करने से पहले उन्हें एक फ़ाइल में मर्ज करने के लिए अपलोड स्क्रीन में "पृष्ठ संयोजित करें" विकल्प का उपयोग करें।',
  },
  other: {
    label: 'अतिरिक्त जानकारी आवश्यक है',
    guidance:
      'कृपया ऊपर अपनी कानूनी टीम का नोट देखें और दस्तावेज़ का सुधारा हुआ संस्करण अपलोड करें।',
    tip: 'यदि आवश्यक जानकारी के बारे में प्रश्न हों तो अपने कानूनी प्रतिनिधि से संपर्क करें।',
  },
}

// ─── Portuguese ───────────────────────────────────────────────────────────────

const pt: RejectionTranslationMap = {
  blurry: {
    label: 'Documento desfocado ou fora de foco',
    guidance:
      'Por favor, tire uma nova foto ou digitalização. Segure a câmera firmemente, certifique-se de que o documento está plano e que todo o texto esteja nítido e claramente visível.',
    tip: 'Use luz natural ou uma sala bem iluminada. Evite o brilho do flash posicionando a câmera diretamente acima do documento.',
  },
  corner_cut: {
    label: 'Cantos ou bordas cortados',
    guidance:
      'Por favor, retire a foto para que todos os quatro cantos do documento estejam totalmente visíveis no enquadramento. Não recorte nem dê zoom em excesso.',
    tip: 'Coloque o documento sobre um fundo escuro — isso facilita ver todas as bordas e enquadrar a foto corretamente.',
  },
  not_readable: {
    label: 'Texto ilegível',
    guidance:
      'Por favor, envie uma cópia mais clara onde todo o texto e números possam ser facilmente lidos. Use uma resolução mais alta no scanner ou câmera.',
    tip: 'Um scanner de mesa geralmente produz um resultado mais claro que uma câmera de celular para documentos com muito texto.',
  },
  needs_translation: {
    label: 'Tradução certificada necessária',
    guidance:
      'Este documento não está em inglês ou francês. Por favor, obtenha uma tradução certificada de um tradutor profissional e envie tanto o documento original quanto a tradução.',
    tip: 'Solicite ao tradutor um certificado de exatidão assinado.',
  },
  wrong_document: {
    label: 'Documento errado enviado',
    guidance:
      'O documento que você enviou não corresponde ao que foi solicitado. Por favor, verifique o título do documento exibido acima e envie o documento correto.',
    tip: 'Se você não tiver certeza de qual documento é necessário, entre em contato com seu representante legal antes de reenviar.',
  },
  expired: {
    label: 'Documento expirado',
    guidance:
      'A data de validade deste documento já passou. Por favor, obtenha uma versão atual e válida da autoridade emissora e envie-a.',
    tip: 'Certifique-se de que a renovação esteja concluída e que a data de validade do novo documento seja claramente visível antes de enviar.',
  },
  incomplete: {
    label: 'Documento incompleto ou páginas ausentes',
    guidance:
      'O documento parece estar faltando páginas ou seções necessárias. Por favor, envie o documento completo incluindo todas as páginas.',
    tip: 'Se o seu documento tiver várias páginas, use a opção "Combinar páginas" na tela de upload para mesclá-las em um único arquivo antes de enviar.',
  },
  other: {
    label: 'Informações adicionais necessárias',
    guidance:
      'Por favor, revise a nota da sua equipe jurídica acima e envie uma versão corrigida do documento.',
    tip: 'Entre em contato com seu representante legal se tiver dúvidas sobre o que é necessário.',
  },
}

// ─── Urdu ─────────────────────────────────────────────────────────────────────

const ur: RejectionTranslationMap = {
  blurry: {
    label: 'دستاویز دھندلی یا غیر واضح ہے',
    guidance:
      'براہ کرم نئی تصویر یا اسکین لیں۔ کیمرہ مستحکم رکھیں، یقینی بنائیں کہ دستاویز سیدھی ہو اور تمام متن واضح دکھائی دے۔',
    tip: 'قدرتی روشنی یا اچھی روشنی والے کمرے کا استعمال کریں۔ فلیش سے چکاچوند سے بچنے کے لیے کیمرہ دستاویز کے بالکل اوپر رکھیں۔',
  },
  corner_cut: {
    label: 'کونے یا کنارے کٹے ہوئے ہیں',
    guidance:
      'براہ کرم تصویر دوبارہ لیں تاکہ دستاویز کے چاروں کونے مکمل طور پر فریم میں نظر آئیں۔ بہت زیادہ کروپ یا زوم نہ کریں۔',
    tip: 'دستاویز کو گہرے رنگ کی پس منظر پر رکھیں — اس سے تمام کنارے دیکھنا اور صحیح فریم کرنا آسان ہو جاتا ہے۔',
  },
  not_readable: {
    label: 'متن پڑھا نہیں جا سکتا',
    guidance:
      'براہ کرم ایک واضح کاپی اپلوڈ کریں جہاں تمام متن اور اعداد آسانی سے پڑھے جا سکیں۔ اسکینر یا کیمرے پر زیادہ ریزولیوشن استعمال کریں۔',
    tip: 'متن والی دستاویزوں کے لیے فلیٹ بیڈ اسکینر عام طور پر فون کیمرے سے بہتر نتیجہ دیتا ہے۔',
  },
  needs_translation: {
    label: 'تصدیق شدہ ترجمہ ضروری ہے',
    guidance:
      'یہ دستاویز انگریزی یا فرانسیسی میں نہیں ہے۔ براہ کرم ایک پیشہ ور مترجم سے تصدیق شدہ ترجمہ حاصل کریں اور اصل دستاویز اور ترجمہ دونوں اپلوڈ کریں۔',
    tip: 'مترجم سے دستخط شدہ درستگی کا سرٹیفکیٹ طلب کریں۔',
  },
  wrong_document: {
    label: 'غلط دستاویز اپلوڈ کی گئی',
    guidance:
      'آپ نے جو دستاویز اپلوڈ کی وہ مطلوبہ دستاویز سے مماثل نہیں ہے۔ براہ کرم اوپر دکھائے گئے عنوان کو چیک کریں اور صحیح دستاویز اپلوڈ کریں۔',
    tip: 'اگر آپ کو یقین نہ ہو کہ کونسی دستاویز درکار ہے تو دوبارہ اپلوڈ کرنے سے پہلے اپنے قانونی نمائندے سے رابطہ کریں۔',
  },
  expired: {
    label: 'دستاویز کی میعاد ختم ہو گئی ہے',
    guidance:
      'اس دستاویز کی میعاد ختم ہو چکی ہے۔ براہ کرم جاری کرنے والے ادارے سے موجودہ اور درست ورژن حاصل کریں اور اپلوڈ کریں۔',
    tip: 'اپلوڈ کرنے سے پہلے یقینی بنائیں کہ تجدید مکمل ہو گئی ہے اور نئی دستاویز پر میعاد ختم ہونے کی تاریخ واضح طور پر نظر آئے۔',
  },
  incomplete: {
    label: 'دستاویز نامکمل ہے یا صفحات غائب ہیں',
    guidance:
      'دستاویز میں صفحات یا ضروری حصے غائب معلوم ہوتے ہیں۔ براہ کرم تمام صفحات سمیت مکمل دستاویز اپلوڈ کریں۔',
    tip: 'اگر آپ کی دستاویز میں متعدد صفحات ہیں تو جمع کرانے سے پہلے انہیں ایک فائل میں ضم کرنے کے لیے اپلوڈ اسکرین میں "صفحات یکجا کریں" آپشن استعمال کریں۔',
  },
  other: {
    label: 'اضافی معلومات درکار ہے',
    guidance:
      'براہ کرم اوپر اپنی قانونی ٹیم کا نوٹ دیکھیں اور دستاویز کا درست ورژن اپلوڈ کریں۔',
    tip: 'اگر ضروری معلومات کے بارے میں سوالات ہوں تو اپنے قانونی نمائندے سے رابطہ کریں۔',
  },
}

// ─── Punjabi ─────────────────────────────────────────────────────────────────

const pa: RejectionTranslationMap = {
  blurry: {
    label: 'ਦਸਤਾਵੇਜ਼ ਧੁੰਦਲਾ ਜਾਂ ਅਸਪਸ਼ਟ ਹੈ',
    guidance:
      'ਕਿਰਪਾ ਕਰਕੇ ਨਵੀਂ ਫੋਟੋ ਜਾਂ ਸਕੈਨ ਲਓ। ਕੈਮਰੇ ਨੂੰ ਸਥਿਰ ਰੱਖੋ, ਯਕੀਨੀ ਕਰੋ ਕਿ ਦਸਤਾਵੇਜ਼ ਸਮਤਲ ਹੋਵੇ ਅਤੇ ਸਾਰਾ ਟੈਕਸਟ ਸਾਫ਼ ਦਿਖਾਈ ਦੇਵੇ।',
    tip: 'ਕੁਦਰਤੀ ਰੌਸ਼ਨੀ ਜਾਂ ਚੰਗੀ ਰੌਸ਼ਨੀ ਵਾਲੇ ਕਮਰੇ ਦੀ ਵਰਤੋਂ ਕਰੋ।',
  },
  corner_cut: {
    label: 'ਕੋਨੇ ਜਾਂ ਕਿਨਾਰੇ ਕੱਟੇ ਹੋਏ ਹਨ',
    guidance:
      'ਕਿਰਪਾ ਕਰਕੇ ਫੋਟੋ ਮੁੜ ਲਓ ਤਾਂ ਜੋ ਦਸਤਾਵੇਜ਼ ਦੇ ਸਾਰੇ ਚਾਰ ਕੋਨੇ ਫ੍ਰੇਮ ਵਿੱਚ ਪੂਰੀ ਤਰ੍ਹਾਂ ਦਿਖਾਈ ਦੇਣ।',
    tip: 'ਦਸਤਾਵੇਜ਼ ਨੂੰ ਗੂੜ੍ਹੇ ਰੰਗ ਦੀ ਪਿੱਠਭੂਮੀ ਉੱਤੇ ਰੱਖੋ।',
  },
  not_readable: {
    label: 'ਟੈਕਸਟ ਪੜ੍ਹਿਆ ਨਹੀਂ ਜਾ ਸਕਦਾ',
    guidance:
      'ਕਿਰਪਾ ਕਰਕੇ ਇੱਕ ਸਾਫ਼ ਕਾਪੀ ਅਪਲੋਡ ਕਰੋ ਜਿੱਥੇ ਸਾਰਾ ਟੈਕਸਟ ਆਸਾਨੀ ਨਾਲ ਪੜ੍ਹਿਆ ਜਾ ਸਕੇ।',
    tip: 'ਫਲੈਟਬੈੱਡ ਸਕੈਨਰ ਆਮ ਤੌਰ ਤੇ ਫ਼ੋਨ ਕੈਮਰੇ ਨਾਲੋਂ ਬਿਹਤਰ ਨਤੀਜਾ ਦਿੰਦਾ ਹੈ।',
  },
  needs_translation: {
    label: 'ਪ੍ਰਮਾਣਿਤ ਅਨੁਵਾਦ ਜ਼ਰੂਰੀ ਹੈ',
    guidance:
      'ਇਹ ਦਸਤਾਵੇਜ਼ ਅੰਗਰੇਜ਼ੀ ਜਾਂ ਫ੍ਰੈਂਚ ਵਿੱਚ ਨਹੀਂ ਹੈ। ਕਿਰਪਾ ਕਰਕੇ ਪੇਸ਼ੇਵਰ ਅਨੁਵਾਦਕ ਤੋਂ ਪ੍ਰਮਾਣਿਤ ਅਨੁਵਾਦ ਲਓ ਅਤੇ ਮੂਲ ਦਸਤਾਵੇਜ਼ ਅਤੇ ਅਨੁਵਾਦ ਦੋਵੇਂ ਅਪਲੋਡ ਕਰੋ।',
    tip: 'ਅਨੁਵਾਦਕ ਤੋਂ ਦਸਤਖ਼ਤ ਕੀਤਾ ਸ਼ੁੱਧਤਾ ਸਰਟੀਫਿਕੇਟ ਮੰਗੋ।',
  },
  wrong_document: {
    label: 'ਗਲਤ ਦਸਤਾਵੇਜ਼ ਅਪਲੋਡ ਕੀਤਾ ਗਿਆ',
    guidance:
      'ਤੁਸੀਂ ਜੋ ਦਸਤਾਵੇਜ਼ ਅਪਲੋਡ ਕੀਤਾ ਉਹ ਬੇਨਤੀ ਕੀਤੇ ਨਾਲ ਮੇਲ ਨਹੀਂ ਖਾਂਦਾ। ਕਿਰਪਾ ਕਰਕੇ ਉੱਪਰ ਦਿਖਾਏ ਨਾਮ ਦੀ ਜਾਂਚ ਕਰੋ ਅਤੇ ਸਹੀ ਦਸਤਾਵੇਜ਼ ਅਪਲੋਡ ਕਰੋ।',
    tip: 'ਜੇ ਤੁਸੀਂ ਯਕੀਨੀ ਨਹੀਂ ਹੋ ਕਿ ਕਿਹੜਾ ਦਸਤਾਵੇਜ਼ ਚਾਹੀਦਾ ਹੈ, ਤਾਂ ਆਪਣੇ ਕਾਨੂੰਨੀ ਪ੍ਰਤੀਨਿਧੀ ਨਾਲ ਸੰਪਰਕ ਕਰੋ।',
  },
  expired: {
    label: 'ਦਸਤਾਵੇਜ਼ ਦੀ ਮਿਆਦ ਪੁੱਗ ਗਈ ਹੈ',
    guidance:
      'ਇਸ ਦਸਤਾਵੇਜ਼ ਦੀ ਮਿਆਦ ਖ਼ਤਮ ਹੋ ਗਈ ਹੈ। ਕਿਰਪਾ ਕਰਕੇ ਜਾਰੀ ਕਰਨ ਵਾਲੀ ਸੰਸਥਾ ਤੋਂ ਮੌਜੂਦਾ ਅਤੇ ਵੈਧ ਸੰਸਕਰਣ ਲਓ ਅਤੇ ਅਪਲੋਡ ਕਰੋ।',
    tip: 'ਅਪਲੋਡ ਕਰਨ ਤੋਂ ਪਹਿਲਾਂ ਯਕੀਨੀ ਕਰੋ ਕਿ ਨਵੇਂ ਦਸਤਾਵੇਜ਼ ਤੇ ਮਿਆਦ ਖ਼ਤਮ ਹੋਣ ਦੀ ਤਾਰੀਖ਼ ਸਾਫ਼ ਦਿਖਾਈ ਦੇਵੇ।',
  },
  incomplete: {
    label: 'ਦਸਤਾਵੇਜ਼ ਅਧੂਰਾ ਹੈ ਜਾਂ ਪੰਨੇ ਗੁੰਮ ਹਨ',
    guidance:
      'ਦਸਤਾਵੇਜ਼ ਵਿੱਚ ਪੰਨੇ ਜਾਂ ਲੋੜੀਂਦੇ ਭਾਗ ਗੁੰਮ ਜਾਪਦੇ ਹਨ। ਕਿਰਪਾ ਕਰਕੇ ਸਾਰੇ ਪੰਨਿਆਂ ਸਮੇਤ ਪੂਰਾ ਦਸਤਾਵੇਜ਼ ਅਪਲੋਡ ਕਰੋ।',
    tip: 'ਜੇ ਤੁਹਾਡੇ ਦਸਤਾਵੇਜ਼ ਵਿੱਚ ਕਈ ਪੰਨੇ ਹਨ, ਤਾਂ ਅਪਲੋਡ ਸਕਰੀਨ ਵਿੱਚ "ਪੰਨੇ ਜੋੜੋ" ਵਿਕਲਪ ਦੀ ਵਰਤੋਂ ਕਰੋ।',
  },
  other: {
    label: 'ਵਾਧੂ ਜਾਣਕਾਰੀ ਲੋੜੀਂਦੀ ਹੈ',
    guidance:
      'ਕਿਰਪਾ ਕਰਕੇ ਉੱਪਰ ਆਪਣੀ ਕਾਨੂੰਨੀ ਟੀਮ ਦਾ ਨੋਟ ਦੇਖੋ ਅਤੇ ਦਸਤਾਵੇਜ਼ ਦਾ ਸੁਧਾਰਿਆ ਸੰਸਕਰਣ ਅਪਲੋਡ ਕਰੋ।',
    tip: 'ਜੇ ਤੁਹਾਡੇ ਕੋਈ ਸਵਾਲ ਹਨ, ਆਪਣੇ ਕਾਨੂੰਨੀ ਪ੍ਰਤੀਨਿਧੀ ਨਾਲ ਸੰਪਰਕ ਕਰੋ।',
  },
}

// ─── Tagalog ──────────────────────────────────────────────────────────────────

const tl: RejectionTranslationMap = {
  blurry: {
    label: 'Malabo o hindi nakatuon ang dokumento',
    guidance:
      'Mangyaring kumuha ng bagong litrato o i-scan. Hawakan nang matatag ang camera, siguraduhing flat ang dokumento, at lahat ng teksto ay malinaw na nakikita.',
    tip: 'Gumamit ng natural na liwanag o maliwanag na silid. Iwasan ang flash sa pamamagitan ng pagposisyon ng camera nang direkta sa itaas ng dokumento.',
  },
  corner_cut: {
    label: 'Nap-putol ang mga sulok o gilid',
    guidance:
      'Mangyaring muling kumuha ng litrato upang lahat ng apat na sulok ng dokumento ay ganap na makikita sa frame. Huwag mag-crop o mag-zoom nang sobra.',
    tip: 'Ilagay ang dokumento sa madilim na background — mas madaling makita ang lahat ng gilid.',
  },
  not_readable: {
    label: 'Hindi mabasa ang teksto',
    guidance:
      'Mangyaring mag-upload ng mas malinaw na kopya kung saan madaling mabasa ang lahat ng teksto at numero. Gumamit ng mas mataas na resolusyon.',
    tip: 'Ang flatbed scanner ay karaniwang nagbibigay ng mas malinaw na resulta kaysa sa camera ng telepono para sa mga dokumentong maraming teksto.',
  },
  needs_translation: {
    label: 'Kailangan ng certified na salin',
    guidance:
      'Ang dokumentong ito ay hindi sa Ingles o Pranses. Mangyaring kumuha ng certified na salin mula sa propesyonal na tagasalin at mag-upload ng parehong orihinal na dokumento at ang salin.',
    tip: 'Humingi sa tagasalin ng nilagdaang sertipiko ng katumpakan.',
  },
  wrong_document: {
    label: 'Maling dokumento ang na-upload',
    guidance:
      'Ang na-upload mong dokumento ay hindi tugma sa hinihingi. Suriin ang pangalan ng dokumento sa itaas at i-upload ang tamang dokumento.',
    tip: 'Kung hindi ka sigurado kung aling dokumento ang kailangan, makipag-ugnayan sa iyong legal na kinatawan bago mag-re-upload.',
  },
  expired: {
    label: 'Nag-expire na ang dokumento',
    guidance:
      'Lumipas na ang petsa ng pagkawala ng bisa ng dokumentong ito. Mangyaring kumuha ng kasalukuyan at wastong bersyon mula sa nagbigay na awtoridad at i-upload ito.',
    tip: 'Siguraduhing nakumpleto ang pag-renew at malinaw na nakikita ang petsa ng pagkawala ng bisa sa bagong dokumento bago mag-upload.',
  },
  incomplete: {
    label: 'Hindi kumpleto ang dokumento o may nawawalang pahina',
    guidance:
      'Mukhang may nawawalang pahina o kinakailangang seksyon ang dokumento. Mangyaring i-upload ang kumpletong dokumento kasama ang lahat ng pahina.',
    tip: 'Kung ang iyong dokumento ay may maraming pahina, gamitin ang opsyong "Pagsamahin ang mga pahina" sa upload screen bago isumite.',
  },
  other: {
    label: 'Kailangan ng karagdagang impormasyon',
    guidance:
      'Suriin ang tala mula sa iyong legal na koponan sa itaas at mag-upload ng corrected na bersyon ng dokumento.',
    tip: 'Makipag-ugnayan sa iyong legal na kinatawan kung may mga katanungan ka tungkol sa kinakailangan.',
  },
}

// ─── Remaining languages (fallback to English) ────────────────────────────────
// For languages not yet fully translated, the getRejectionInfo function falls
// back to English. Add translations here as needed.

// ─── Translation Registry ────────────────────────────────────────────────────

const TRANSLATIONS: Partial<Record<PortalLocale, RejectionTranslationMap>> = {
  en,
  fr,
  es,
  ar,
  zh,
  hi,
  pt,
  ur,
  pa,
  tl,
}

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Get translated rejection reason info for the given code and locale.
 * Falls back to English if the locale is not yet translated.
 */
export function getRejectionInfo(
  code: RejectionReasonCode | null | undefined,
  locale: PortalLocale,
): RejectionReasonInfo | null {
  if (!code) return null
  const map = TRANSLATIONS[locale] ?? TRANSLATIONS['en']!
  return map[code] ?? null
}

/**
 * Section headings for the rejection info panel.
 */
export const REJECTION_UI_LABELS: Partial<Record<PortalLocale, { how_to_fix: string; tip: string }>> = {
  en: { how_to_fix: 'How to fix it', tip: 'Tip' },
  fr: { how_to_fix: 'Comment y remédier', tip: 'Conseil' },
  es: { how_to_fix: 'Cómo solucionarlo', tip: 'Consejo' },
  ar: { how_to_fix: 'كيفية الإصلاح', tip: 'نصيحة' },
  zh: { how_to_fix: '如何修复', tip: '提示' },
  hi: { how_to_fix: 'इसे कैसे ठीक करें', tip: 'सुझाव' },
  pt: { how_to_fix: 'Como corrigir', tip: 'Dica' },
  ur: { how_to_fix: 'اسے کیسے ٹھیک کریں', tip: 'مشورہ' },
  pa: { how_to_fix: 'ਇਸ ਨੂੰ ਕਿਵੇਂ ਠੀਕ ਕਰੀਏ', tip: 'ਸੁਝਾਅ' },
  tl: { how_to_fix: 'Paano ayusin', tip: 'Tip' },
}

export function getRejectionUiLabels(locale: PortalLocale): { how_to_fix: string; tip: string } {
  return REJECTION_UI_LABELS[locale] ?? REJECTION_UI_LABELS['en']!
}
