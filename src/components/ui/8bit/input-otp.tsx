import {
  type VariantProps,
  cva,
} from "class-variance-authority";

import { cn } from "@/lib/utils";

import {
  InputOTP as ShadcnInputOTP,
  InputOTPGroup as ShadcnInputOTPGroup,
  InputOTPSeparator as ShadcnInputOTPSeparator,
  InputOTPSlot as ShadcnInputOTPSlot,
} from "@/components/ui/input-otp";

import "@/components/ui/8bit/styles/retro.css";

export const inputVariants = cva("", {
  variants: {
    font: {
      normal: "",
      retro: "retro",
    },
  },
  defaultVariants: {
    font: "retro",
  },
});

interface SharedProps
  extends React.ComponentProps<"div">,
    VariantProps<typeof inputVariants> {
  className?: string;
  children?: React.ReactNode;
}

interface InputOTPProps {
  maxLength: number;
  value?: string;
  onChange?: (value: string) => unknown;
  children?: React.ReactNode;
  className?: string;
  containerClassName?: string;
  font?: "normal" | "retro";
}

export const InputOTP = ({
  className,
  font,
  maxLength,
  value,
  onChange,
  children,
  containerClassName,
  ...otherProps
}: InputOTPProps) => {
  return (
    <div
      className={cn(
        "relative w-full max-w-full min-w-0",
        className,
      )}
    >
      <ShadcnInputOTP
        maxLength={maxLength}
        value={value}
        onChange={onChange}
        containerClassName={containerClassName}
        {...otherProps}
        className={cn(
          "w-full max-w-full min-w-0",
          font !== "normal" && "retro",
          className,
        )}
      >
        {children}
      </ShadcnInputOTP>
    </div>
  );
};

export const InputOTPGroup = ({
  className,
  ...props
}: SharedProps) => {
  return (
    <ShadcnInputOTPGroup
      {...props}
      className={cn(
        "flex gap-0",
        className,
      )}
    />
  );
};

export const InputOTPSlot = ({
  className,
  font,
  index = 0,
  style,
  ...props
}: SharedProps & {
  index?: number;
}) => {
  return (
    <div
      className={cn(
        "relative h-8 w-7 shrink-0 border-y-6 border-foreground dark:border-ring box-border",
        className,
      )}
      style={style}
    >
      <ShadcnInputOTPSlot
        index={index}
        {...props}
        className={cn(
          "size-full pl-1 text-center text-xl tracking-widest z-0 ring-0 border-transparent",
          font !== "normal" && "retro",
        )}
      />

      <div
        className="
          absolute
          inset-0
          border-x-6
          -mx-1.5
          border-foreground
          dark:border-ring
          pointer-events-none
          box-border
        "
        aria-hidden="true"
      />
    </div>
  );
};

export const InputOTPSeparator = ({
  className,
  ...props
}: SharedProps) => {
  return (
    <ShadcnInputOTPSeparator
      {...props}
      className={cn("", className)}
    />
  );
};
