import { useEffect, useRef, useState } from "react";
import {
  InputOTP,
  InputOTPGroup,
  InputOTPSlot,
} from "./ui/8bit/input-otp";

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

  const [containerWidth, setContainerWidth] = useState(0);

  /*
   * Example:
   *
   * "********** *****"
   *
   * becomes:
   *
   * ["**********", "*****"]
   */
  const groups = pattern.trim().split(/\s+/);

  /*
   * Total number of answer characters.
   * Spaces are only visual separators.
   */
  const maxLength = groups.reduce(
    (total, group) => total + group.length,
    0,
  );

  /*
   * Measure the actual width available to the component.
   */
  useEffect(() => {
    const container = containerRef.current;

    if (!container) {
      return;
    }

    const updateWidth = () => {
      setContainerWidth(container.clientWidth);
    };

    updateWidth();

    const resizeObserver = new ResizeObserver(updateWidth);

    resizeObserver.observe(container);

    return () => {
      resizeObserver.disconnect();
    };
  }, []);

  /*
   * Change the underlying input from OTP/numeric behavior
   * to a normal text input so that mobile devices show
   * the alphabetic keyboard.
   */
  useEffect(() => {
    const input = containerRef.current?.querySelector("input");

    if (!input) {
      return;
    }

    input.setAttribute("type", "text");
    input.setAttribute("inputmode", "text");
    input.removeAttribute("pattern");
  }, []);

  /*
   * Calculate the size of each slot.
   *
   * Each WORD must stay on one line.
   *
   * Example:
   *
   * ********
   *
   * stays on one line.
   *
   * ******** ******
   *
   * becomes two lines.
   */
  const getSlotSize = (wordLength: number) => {
    if (!containerWidth || wordLength <= 0) {
      return {
        width: 28,
        height: 32,
      };
    }

    /*
    * Small safety margin for the edges of the answer area.
    * The previous 44px was too conservative.
    */
    const safetyMargin = 12;

    const availableWidth =
      containerWidth - safetyMargin;

    /*
    * Calculate the maximum slot width that allows
    * the complete word to remain on one line.
    */
    const calculatedWidth =
      availableWidth / wordLength;

    /*
    * Allow the slots to be larger now that the
    * 8-bit wrapper is responsive.
    */
    const width = Math.min(
      32,
      Math.floor(calculatedWidth),
    );

    /*
    * Don't make very long answers unusably small.
    */
    const finalWidth = Math.max(width, 18);

    /*
    * Slightly taller than wide to preserve the
    * 8-bit appearance.
    */
    const height = Math.round(
      finalWidth * 1.15,
    );

    return {
      width: finalWidth,
      height,
    };
  };

  return (
    <div
      ref={containerRef}
      className="
        mx-auto
        w-full
        max-w-full
        min-w-0
        px-2
      "
    >
      <InputOTP
        maxLength={maxLength}
        value={value}
        onChange={onChange}
        containerClassName="
          flex
          w-full
          max-w-full
          min-w-0
          flex-col
          items-center
          justify-center
          gap-2
        "
      >
        {groups.map((group, groupIndex) => {
          /*
           * Calculate the index at which this word starts
           * in the complete OTP value.
           */
          const startIndex = groups
            .slice(0, groupIndex)
            .reduce(
              (total, current) =>
                total + current.length,
              0,
            );

          const slotSize = getSlotSize(group.length);

          return (
            <InputOTPGroup
              key={`${group}-${groupIndex}`}
              className="
                flex
                max-w-full
                min-w-0
                flex-nowrap
                justify-center
                gap-0
              "
            >
              {group.split("").map((_, index) => (
                <InputOTPSlot
                  key={startIndex + index}
                  index={startIndex + index}
                  style={{
                    width: `${slotSize.width}px`,
                    height: `${slotSize.height}px`,
                  }}
                  className="
                    !box-border
                    !min-w-0
                    !shrink-0
                    !p-0
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

export default AnswerInput;