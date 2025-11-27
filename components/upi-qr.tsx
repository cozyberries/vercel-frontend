import QRCode from 'react-qr-code';
import { buildUpiUrl } from '@/lib/utils/upi';

interface UpiQrProps {
  upiId: string;
  name: string;
  amount: number;
  note: string;
  shopName?: string;
  logoUrl?: string;
  countdown?: number;
}

const UpiQr = ({
  upiId,
  name,
  amount,
  note,
  shopName,
  logoUrl,
  countdown
}: UpiQrProps) => {
  const upiUrl = buildUpiUrl({ upiId, name, amount, note });

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s.toString().padStart(2, "0")}`; // Example: 2:30
  };
  

  return (
    <div
      style={{
        display: 'inline-block',
        border: '1px solid #ddd',
        borderRadius: 8,
        background: '#fff',
        padding: 24,
        minWidth: 350,
        textAlign: 'center',
        boxShadow: '0 4px 24px rgba(60,60,60,0.06)',
      }}
    >
      {logoUrl && (
        <img
          src={logoUrl}
          alt={shopName}
          style={{ maxHeight: 64, marginBottom: 8, borderRadius: 2, margin: "auto" }}
        />
      )}
      <div style={{ fontWeight: 600, letterSpacing: 1.2, fontSize: 18, marginBottom: 12 }}>
        {shopName}
      </div>
      <div style={{ marginBottom: 12, color: '#888', fontSize: 14, fontWeight: 400 }}>
        UPI Payment to <span style={{ fontWeight: 600 }}>{name}</span>
      </div>
      <QRCode
        value={upiUrl}
        size={256}
        bgColor="#fff"
        fgColor="#333"
        style={{
          margin: "0 auto",
          background: '#fff'
        }}
      />
      <div style={{ marginTop: 16, fontSize: 16, fontWeight: 500, color: "#2a7d46" }}>
        ₹{amount.toFixed(2)}
      </div>
      <div style={{ marginTop: 6, fontSize: 13, color: "#595959" }}>
        {note ? `Note: ${note}` : ""}
      </div>
      <div style={{ marginTop: 12, fontSize: 11, color: '#aaa' }}>
        Powered by UPI | Scan & Pay
      </div>
      {countdown && countdown > 0 ? (
        <div style={{ marginTop: 12, fontSize: 20, fontWeight: 600, color: '#3b8132' }}>
          Auto-verifying payment in {formatTime(countdown)} minutes...
        </div>
      ) : (
        <div style={{ marginTop: 12, fontSize: 20, fontWeight: 600, color: '#3b8132' }}>
            Wait for payment to be detected...
        </div>
      )}
    </div>
  );
};

export default UpiQr;

