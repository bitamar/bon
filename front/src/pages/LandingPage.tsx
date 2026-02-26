import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import classes from './LandingPage.module.css';

const COLORS = {
  bg: '#FAFAF7',
  bgCard: '#FFFFFF',
  text: '#1A1A1A',
  textMuted: '#6B6B6B',
  textLight: '#9B9B9B',
  accent: '#25D366',
  accentLight: '#DCF8C6',
  whatsappBg: '#E5DDD5',
  whatsappHeader: '#075E54',
  border: '#E8E8E4',
  pricingHighlight: '#F0FAF0',
  badge: '#FFF3E0',
  badgeText: '#E65100',
  dark: '#111111',
};

const FONTS = {
  display: "'Outfit', sans-serif",
  body: "'Rubik', sans-serif",
};

const CHAT_MESSAGES = [
  {
    type: 'user' as const,
    text: 'חשבונית לדני כהן, 3,500 ₪ על ייעוץ עסקי',
    time: '10:32',
  },
  {
    type: 'bot' as const,
    text: 'הפקתי חשבונית מס 305 מספר 0042 עבור דני כהן על סך 3,500 ₪ + מע״מ (4,095 ₪).\n\nמספר הקצאה: IL-2026-849271\n\n📄 נשלחה ללקוח במייל.',
    time: '10:32',
  },
  {
    type: 'user' as const,
    text: 'תשלח גם בוואטסאפ',
    time: '10:33',
  },
  {
    type: 'bot' as const,
    text: '✅ נשלחה לדני בוואטסאפ.',
    time: '10:33',
  },
];

const STEPS = [
  {
    num: '1',
    icon: '🔐',
    title: 'הירשם תוך דקה',
    desc: 'התחבר עם Google, הגדר את פרטי העסק — ח.פ, סוג עוסק, מספור חשבוניות',
  },
  {
    num: '2',
    icon: '📱',
    title: 'חבר את הוואטסאפ',
    desc: 'שלח הודעה ראשונה ל-bon וקשר את מספר הטלפון לחשבון',
  },
  {
    num: '3',
    icon: '💬',
    title: 'שלח הודעה, קבל חשבונית',
    desc: 'מעכשיו — כל חשבונית היא הודעה. בלי להיכנס לשום מערכת',
  },
];

type PricingPlan = {
  name: string;
  price: string;
  period: string;
  desc: string;
  features: string[];
  cta: string;
  highlighted: boolean;
};

const PRICING: PricingPlan[] = [
  {
    name: 'ניסיון',
    price: '0',
    period: 'ל-3 חודשים',
    desc: 'להתנסות בלי התחייבות',
    features: [
      '3 חשבוניות בחודש',
      'עסק אחד',
      'שליחה במייל + וואטסאפ',
      'מספרי הקצאה',
      'בלי כרטיס אשראי',
    ],
    cta: 'התחל בחינם',
    highlighted: false,
  },
  {
    name: 'עצמאי',
    price: '29',
    period: '₪ / חודש',
    desc: 'לעצמאים ועוסקים מורשים',
    features: [
      'חשבוניות ללא הגבלה',
      'עסק אחד',
      'כל סוגי המסמכים',
      'שליחה במייל + וואטסאפ',
      'דוחות לרו״ח',
    ],
    cta: 'התחל בחינם',
    highlighted: true,
  },
  {
    name: 'מפתחים',
    price: '59',
    period: '₪ / חודש',
    desc: 'API לאינטגרציות',
    features: ['הכל בעצמאי, ועוד:', 'מספר עסקים', 'גישת REST API', 'Webhooks', 'תמיכה בעדיפות'],
    cta: 'צור קשר',
    highlighted: false,
  },
];

const WA_PATTERN_BG =
  "url(\"data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23c9c2b6' fill-opacity='0.15'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E\")";

function WhatsAppMockup() {
  const [visibleMessages, setVisibleMessages] = useState<typeof CHAT_MESSAGES>([]);
  const chatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setVisibleMessages([]);
    const timeouts = CHAT_MESSAGES.map((msg, i) =>
      setTimeout(
        () => {
          setVisibleMessages((prev) => [...prev, msg]);
        },
        800 + i * 900
      )
    );
    return () => timeouts.forEach(clearTimeout);
  }, []);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView?.({ behavior: 'smooth' });
  }, [visibleMessages]);

  return (
    <div
      style={{
        width: 310,
        borderRadius: 24,
        overflow: 'hidden',
        boxShadow: '0 25px 60px rgba(0,0,0,0.12), 0 8px 20px rgba(0,0,0,0.08)',
        background: COLORS.whatsappBg,
        fontFamily: FONTS.body,
        direction: 'rtl',
        flexShrink: 0,
      }}
    >
      {/* WhatsApp header */}
      <div
        style={{
          background: COLORS.whatsappHeader,
          color: '#fff',
          padding: '14px 16px',
          display: 'flex',
          alignItems: 'center',
          gap: 10,
        }}
      >
        <div
          style={{
            width: 36,
            height: 36,
            borderRadius: '50%',
            background: 'linear-gradient(135deg, #25D366, #128C7E)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 16,
            fontWeight: 700,
            fontFamily: FONTS.display,
            color: '#fff',
          }}
        >
          b
        </div>
        <div>
          <div style={{ fontSize: 15, fontWeight: 600 }}>bon</div>
          <div style={{ fontSize: 11, opacity: 0.8 }}>מקוון</div>
        </div>
      </div>

      {/* Chat messages */}
      <div
        style={{
          padding: '12px 10px',
          minHeight: 310,
          maxHeight: 350,
          overflowY: 'auto',
          display: 'flex',
          flexDirection: 'column',
          gap: 6,
          backgroundImage: WA_PATTERN_BG,
        }}
      >
        {visibleMessages.map((msg, i) => (
          <div
            key={i}
            className={classes['fadeSlideIn']}
            style={{
              alignSelf: msg.type === 'user' ? 'flex-end' : 'flex-start',
              maxWidth: '82%',
            }}
          >
            <div
              style={{
                background: msg.type === 'user' ? COLORS.accentLight : '#fff',
                borderRadius: msg.type === 'user' ? '12px 2px 12px 12px' : '2px 12px 12px 12px',
                padding: '7px 10px 4px',
                fontSize: 13.5,
                lineHeight: 1.55,
                color: COLORS.text,
                whiteSpace: 'pre-line',
                boxShadow: '0 1px 2px rgba(0,0,0,0.06)',
              }}
            >
              {msg.text}
              <div
                style={{
                  fontSize: 10.5,
                  color: COLORS.textLight,
                  textAlign: 'left',
                  marginTop: 2,
                  direction: 'ltr',
                }}
              >
                {msg.time} {msg.type === 'bot' && '✓✓'}
              </div>
            </div>
          </div>
        ))}
        <div ref={chatEndRef} />
      </div>

      {/* Input bar */}
      <div
        style={{
          padding: '8px 10px',
          background: '#F0F0F0',
          display: 'flex',
          alignItems: 'center',
          gap: 8,
        }}
      >
        <div
          style={{
            flex: 1,
            background: '#fff',
            borderRadius: 20,
            padding: '8px 14px',
            fontSize: 13,
            color: COLORS.textLight,
          }}
        >
          הקלד הודעה
        </div>
        <div
          style={{
            width: 36,
            height: 36,
            borderRadius: '50%',
            background: COLORS.whatsappHeader,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 16,
          }}
        >
          🎤
        </div>
      </div>
    </div>
  );
}

function PricingCard({ plan }: Readonly<{ plan: PricingPlan }>) {
  return (
    <div
      className={classes['pricingCard']}
      style={{
        background: plan.highlighted ? COLORS.pricingHighlight : COLORS.bgCard,
        border: plan.highlighted ? `2px solid ${COLORS.accent}` : `1px solid ${COLORS.border}`,
        borderRadius: 16,
        padding: '32px 24px',
        flex: '1 1 260px',
        maxWidth: 320,
        position: 'relative',
        boxShadow: '0 2px 8px rgba(0,0,0,0.03)',
        direction: 'rtl',
      }}
    >
      {plan.highlighted && (
        <div
          style={{
            position: 'absolute',
            top: -12,
            right: 20,
            background: COLORS.accent,
            color: '#fff',
            fontSize: 12,
            fontWeight: 600,
            padding: '4px 14px',
            borderRadius: 20,
            fontFamily: FONTS.body,
          }}
        >
          הכי פופולרי
        </div>
      )}
      <div
        style={{
          fontSize: 17,
          fontWeight: 700,
          color: COLORS.text,
          fontFamily: FONTS.body,
          marginBottom: 4,
        }}
      >
        {plan.name}
      </div>
      <div style={{ fontSize: 13, color: COLORS.textMuted, marginBottom: 20 }}>{plan.desc}</div>
      <div
        style={{
          display: 'flex',
          alignItems: 'baseline',
          gap: 4,
          marginBottom: 24,
        }}
      >
        <span
          style={{
            fontSize: 40,
            fontWeight: 800,
            fontFamily: FONTS.display,
            color: COLORS.text,
            lineHeight: 1,
          }}
        >
          {plan.price === '0' ? 'חינם' : plan.price}
        </span>
        {plan.period ? (
          <span style={{ fontSize: 14, color: COLORS.textMuted }}>{plan.period}</span>
        ) : null}
      </div>
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 10,
          marginBottom: 28,
        }}
      >
        {plan.features.map((f, i) => (
          <div
            key={i}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              fontSize: 14,
              color: COLORS.text,
            }}
          >
            <span style={{ color: COLORS.accent, fontSize: 14, flexShrink: 0 }}>✓</span>
            {f}
          </div>
        ))}
      </div>
      <Link
        to="/login"
        style={{
          display: 'block',
          width: '100%',
          padding: '12px 0',
          borderRadius: 10,
          border: plan.highlighted ? 'none' : `1px solid ${COLORS.border}`,
          background: plan.highlighted ? COLORS.accent : 'transparent',
          color: plan.highlighted ? '#fff' : COLORS.text,
          fontSize: 15,
          fontWeight: 600,
          fontFamily: FONTS.body,
          cursor: 'pointer',
          transition: 'background 0.2s ease',
          textAlign: 'center',
          textDecoration: 'none',
        }}
      >
        {plan.cta}
      </Link>
    </div>
  );
}

export function LandingPage() {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 40);
    window.addEventListener('scroll', onScroll);
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <div
      style={{
        fontFamily: FONTS.body,
        background: COLORS.bg,
        color: COLORS.text,
        minHeight: '100vh',
        direction: 'rtl',
      }}
    >
      {/* Nav */}
      <nav
        className={classes['navBlur']}
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          zIndex: 100,
          padding: '0 32px',
          height: 64,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          background: scrolled ? 'rgba(250,250,247,0.92)' : 'transparent',
          borderBottom: scrolled ? `1px solid ${COLORS.border}` : 'none',
          transition: 'all 0.3s ease',
        }}
      >
        <div
          style={{
            fontFamily: FONTS.display,
            fontSize: 28,
            fontWeight: 800,
            color: COLORS.text,
            letterSpacing: '-0.02em',
          }}
        >
          bon
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 28 }}>
          <a
            href="#how"
            style={{
              fontSize: 14,
              color: COLORS.textMuted,
              textDecoration: 'none',
              fontWeight: 500,
            }}
          >
            איך זה עובד
          </a>
          <a
            href="#pricing"
            style={{
              fontSize: 14,
              color: COLORS.textMuted,
              textDecoration: 'none',
              fontWeight: 500,
            }}
          >
            מחירים
          </a>
          <span
            style={{
              fontSize: 14,
              color: COLORS.textMuted,
              fontWeight: 500,
            }}
          >
            API
          </span>
          <Link
            to="/login"
            style={{
              background: COLORS.text,
              color: '#fff',
              borderRadius: 8,
              padding: '8px 20px',
              fontSize: 14,
              fontWeight: 600,
              fontFamily: FONTS.body,
              textDecoration: 'none',
            }}
          >
            כניסה
          </Link>
        </div>
      </nav>

      {/* Hero */}
      <section
        style={{
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '100px 40px 60px',
          gap: 56,
          flexWrap: 'wrap',
          maxWidth: 1160,
          margin: '0 auto',
        }}
      >
        <div
          className={classes['fadeIn']}
          style={{
            flex: '1 1 400px',
            maxWidth: 500,
          }}
        >
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              background: COLORS.badge,
              color: COLORS.badgeText,
              fontSize: 13,
              fontWeight: 600,
              padding: '5px 14px',
              borderRadius: 20,
              marginBottom: 24,
            }}
          >
            🇮🇱 תואם חשבוניות ישראל 2026
          </div>
          <h1
            style={{
              fontFamily: FONTS.body,
              fontSize: 50,
              fontWeight: 800,
              lineHeight: 1.15,
              color: COLORS.text,
              marginBottom: 20,
            }}
          >
            חשבונית מס
            <br />
            <span style={{ color: COLORS.accent }}>בהודעת וואטסאפ.</span>
          </h1>
          <p
            style={{
              fontSize: 17,
              lineHeight: 1.7,
              color: COLORS.textMuted,
              marginBottom: 36,
              maxWidth: 410,
            }}
          >
            הגדר את העסק פעם אחת. מעכשיו כל חשבונית היא הודעה — bon מפיק, ממספר, מוסיף מספר הקצאה
            ושולח ללקוח. בלי להיכנס לשום דשבורד.
          </p>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 14,
              flexWrap: 'wrap',
            }}
          >
            <Link
              to="/login"
              style={{
                display: 'inline-block',
                background: COLORS.accent,
                color: '#fff',
                borderRadius: 12,
                padding: '14px 32px',
                fontSize: 16,
                fontWeight: 700,
                fontFamily: FONTS.body,
                textDecoration: 'none',
                boxShadow: '0 4px 14px rgba(37,211,102,0.3)',
              }}
            >
              צור חשבון בחינם →
            </Link>
            <span
              style={{
                fontSize: 14,
                color: COLORS.textMuted,
                fontWeight: 500,
                padding: '14px 8px',
              }}
            >
              תיעוד API
            </span>
          </div>

          <div
            style={{
              marginTop: 40,
              display: 'flex',
              gap: 36,
              paddingTop: 28,
              borderTop: `1px solid ${COLORS.border}`,
            }}
          >
            <div>
              <div
                style={{
                  fontSize: 24,
                  fontWeight: 800,
                  fontFamily: FONTS.display,
                }}
              >
                30 שנ׳
              </div>
              <div style={{ fontSize: 13, color: COLORS.textMuted }}>להפקת חשבונית</div>
            </div>
            <div>
              <div
                style={{
                  fontSize: 24,
                  fontWeight: 800,
                  fontFamily: FONTS.display,
                }}
              >
                0
              </div>
              <div style={{ fontSize: 13, color: COLORS.textMuted }}>כניסות לדשבורד ביום</div>
            </div>
            <div>
              <div
                style={{
                  fontSize: 24,
                  fontWeight: 800,
                  fontFamily: FONTS.display,
                }}
              >
                100%
              </div>
              <div style={{ fontSize: 13, color: COLORS.textMuted }}>תואם רשות המיסים</div>
            </div>
          </div>
        </div>

        <div className={classes['fadeInDelayed']} style={{ flex: '0 0 auto' }}>
          <div className={classes['float']}>
            <WhatsAppMockup />
          </div>
        </div>
      </section>

      {/* How it works */}
      <section
        id="how"
        style={{
          padding: '80px 40px',
          maxWidth: 960,
          margin: '0 auto',
          scrollMarginTop: 80,
        }}
      >
        <h2
          style={{
            textAlign: 'center',
            fontSize: 34,
            fontWeight: 800,
            marginBottom: 12,
          }}
        >
          הגדרה פעם אחת. חשבוניות מוואטסאפ לתמיד.
        </h2>
        <p
          style={{
            textAlign: 'center',
            fontSize: 15,
            color: COLORS.textMuted,
            marginBottom: 52,
            maxWidth: 460,
            margin: '0 auto 52px',
            lineHeight: 1.6,
          }}
        >
          דקה להגדרת העסק, ואז שוכחים מהדשבורד.
        </p>
        <div
          style={{
            display: 'flex',
            gap: 20,
            justifyContent: 'center',
            flexWrap: 'wrap',
          }}
        >
          {STEPS.map((s, i) => (
            <div
              key={i}
              style={{
                flex: '1 1 240px',
                maxWidth: 290,
                background: COLORS.bgCard,
                border: `1px solid ${COLORS.border}`,
                borderRadius: 16,
                padding: '28px 22px',
                textAlign: 'center',
              }}
            >
              <div style={{ fontSize: 32, marginBottom: 12 }}>{s.icon}</div>
              <div
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  width: 26,
                  height: 26,
                  borderRadius: '50%',
                  background: COLORS.accent,
                  color: '#fff',
                  fontSize: 13,
                  fontWeight: 700,
                  fontFamily: FONTS.display,
                  marginBottom: 10,
                }}
              >
                {s.num}
              </div>
              <div style={{ fontSize: 17, fontWeight: 700, marginBottom: 8 }}>{s.title}</div>
              <div
                style={{
                  fontSize: 14,
                  color: COLORS.textMuted,
                  lineHeight: 1.6,
                }}
              >
                {s.desc}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Compliance */}
      <section
        style={{
          padding: '0 40px 60px',
          maxWidth: 700,
          margin: '0 auto',
        }}
      >
        <div
          style={{
            background: COLORS.bgCard,
            border: `1px solid ${COLORS.border}`,
            borderRadius: 16,
            padding: '28px 32px',
            display: 'flex',
            alignItems: 'center',
            gap: 20,
            flexWrap: 'wrap',
          }}
        >
          <div style={{ fontSize: 32 }}>🏛️</div>
          <div style={{ flex: 1, minWidth: 220 }}>
            <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 4 }}>
              תואם לדרישות רשות המיסים
            </div>
            <div
              style={{
                fontSize: 14,
                color: COLORS.textMuted,
                lineHeight: 1.6,
              }}
            >
              חשבוניות מס (305), חשבוניות עסקה (320), חשבוניות זיכוי (330), מספרי הקצאה אוטומטיים,
              חתימה דיגיטלית.
            </div>
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section
        id="pricing"
        style={{
          padding: '0 40px 80px',
          maxWidth: 1060,
          margin: '0 auto',
          scrollMarginTop: 80,
        }}
      >
        <h2
          style={{
            textAlign: 'center',
            fontSize: 34,
            fontWeight: 800,
            marginBottom: 12,
          }}
        >
          מחירים
        </h2>
        <p
          style={{
            textAlign: 'center',
            fontSize: 15,
            color: COLORS.textMuted,
            marginBottom: 48,
          }}
        >
          בלי הפתעות. בלי עמלות נסתרות.
        </p>
        <div
          style={{
            display: 'flex',
            gap: 18,
            justifyContent: 'center',
            flexWrap: 'wrap',
            alignItems: 'flex-start',
          }}
        >
          {PRICING.map((plan, i) => (
            <PricingCard key={i} plan={plan} />
          ))}
        </div>
      </section>

      {/* CTA */}
      <section
        style={{
          padding: '0 40px 80px',
          maxWidth: 680,
          margin: '0 auto',
          textAlign: 'center',
        }}
      >
        <div
          style={{
            background: COLORS.dark,
            borderRadius: 24,
            padding: '52px 40px',
            color: '#fff',
          }}
        >
          <h2 style={{ fontSize: 28, fontWeight: 800, marginBottom: 12 }}>
            דקה אחת להגדרה.
            <br />
            אחרי זה — רק וואטסאפ.
          </h2>
          <p
            style={{
              fontSize: 15,
              color: 'rgba(255,255,255,0.6)',
              marginBottom: 32,
              maxWidth: 380,
              margin: '0 auto 32px',
              lineHeight: 1.6,
            }}
          >
            צור חשבון, הגדר את העסק, חבר את הוואטסאפ — ולא תצטרך להיכנס לדשבורד שוב.
          </p>
          <Link
            to="/login"
            style={{
              display: 'inline-block',
              background: COLORS.accent,
              color: '#fff',
              borderRadius: 12,
              padding: '14px 36px',
              fontSize: 16,
              fontWeight: 700,
              fontFamily: FONTS.body,
              textDecoration: 'none',
              boxShadow: '0 4px 14px rgba(37,211,102,0.4)',
            }}
          >
            צור חשבון בחינם →
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer
        style={{
          padding: '28px 40px',
          maxWidth: 1160,
          margin: '0 auto',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          borderTop: `1px solid ${COLORS.border}`,
          flexWrap: 'wrap',
          gap: 16,
        }}
      >
        <div
          style={{
            fontFamily: FONTS.display,
            fontSize: 20,
            fontWeight: 800,
            color: COLORS.textLight,
          }}
        >
          bon
        </div>
        <div
          style={{
            display: 'flex',
            gap: 24,
            fontSize: 13,
            color: COLORS.textLight,
          }}
        >
          <span style={{ color: COLORS.textLight }}>API Docs</span>
          <span style={{ color: COLORS.textLight }}>תנאי שימוש</span>
          <span style={{ color: COLORS.textLight }}>פרטיות</span>
          <span style={{ color: COLORS.textLight }}>צור קשר</span>
        </div>
      </footer>
    </div>
  );
}
