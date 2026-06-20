import { toast as sonnerToast } from "sonner";

type ToastVariant = "default" | "destructive";

interface ToastOptions {
  title?: string;
  description?: string;
  variant?: ToastVariant;
  duration?: number;
}

interface ToastAction {
  altText: string;
  onClick: () => void;
  children: React.ReactNode;
}

interface Toast {
  id: string;
  title?: string;
  description?: string;
  variant?: ToastVariant;
  action?: ToastAction;
}

let toastCount = 0;
const listeners: Array<(toasts: Toast[]) => void> = [];

function notifyListeners() {
  // We keep a minimal in-memory stack for the toaster component
}

export function useToast() {
  const toast = (options: ToastOptions) => {
    toastCount++;
    const id = `toast-${toastCount}`;

    if (options.variant === "destructive") {
      sonnerToast.error(options.title ?? "Error", {
        id,
        description: options.description,
        duration: options.duration ?? 5000,
      });
    } else {
      sonnerToast(options.title ?? "", {
        id,
        description: options.description,
        duration: options.duration ?? 4000,
      });
    }

    return { id };
  };

  const dismiss = (toastId?: string) => {
    if (toastId) {
      sonnerToast.dismiss(toastId);
    } else {
      sonnerToast.dismiss();
    }
  };

  return {
    toast,
    dismiss,
    toasts: [] as Toast[],
  };
}

export { sonnerToast as toast };
