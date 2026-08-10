import { useEffect, useRef } from "react";

interface AnswerInputProps {
  pattern: string;
  value: string;
  onChange: (value: string) => void;
}

const AnswerInput = ({
  pattern,
  value,
  onChange,
}: AnswerInputProps) => {
  const containerRef = useRef<HTMLDivElement>(null);

  const groups = pattern.trim().split(/\s+/);

  const maxLength = groups.reduce(
    (total, group) => total + group.length,
    0,
  );

  useEffect(() => {
    const input = containerRef.current?.querySelector("input");

    if (!input) {
      return;
    }

    input.setAttribute("type", "text");
    input.setAttribute("inputmode", "text");
    input.removeAttribute("pattern");
  }, []);

  return (
    <div ref={containerRef} className="w-full">
      <InputOTP
        maxLength={totalLength}
        value={value}
        onChange={onChange}
        containerClassName="w-full flex flex-wrap justify-center gap-2 sm:gap-3"
      >
        {groups.map((group, groupIndex) => {
          const startIndex = groups
            .slice(0, groupIndex)
            .reduce(
              (total, current) => total + current.length,
              0,
            );

          return (
            <InputOTPGroup
              key={`${group}-${groupIndex}`}
              className="shrink-0"
            >
              {group.split("").map((_, index) => (
                <InputOTPSlot
                  key={startIndex + index}
                  index={startIndex + index}
                  className="
                    h-8 w-7
                    sm:h-9 sm:w-8
                    md:h-10 md:w-10
                  "
                />
              ))}
            </InputOTPGroup>
          );
        })}
      </InputOTP>
    </div>
  );
};

export default AnswerInput