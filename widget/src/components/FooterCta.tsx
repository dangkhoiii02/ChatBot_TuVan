interface Props {
  disabled: boolean;
  onFill: () => void;
}

export function FooterCta({ disabled, onFill }: Props) {
  return (
    <footer className="footer">
      <button type="button" className="btn btn-primary footer-cta" disabled={disabled} onClick={onFill}>
        Đổ vào ô soạn
      </button>
    </footer>
  );
}
