 /* eslint-disable @typescript-eslint/no-unused-vars */
const copyUrl = () => {
    if (typeof window !== "undefined") {
      const text = window.location.href;
      if (!navigator.clipboard) {
        const textArea = document.createElement("textarea");
        textArea.value = text;
        document.body.appendChild(textArea);
        textArea.focus();
        textArea.select();
        try {
          document.execCommand("copy");
        } catch (err) {}
        document.body.removeChild(textArea);
        return;
      }
      navigator.clipboard.writeText(text);
    }
  };