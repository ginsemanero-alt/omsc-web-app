import React from "react"
import * as TabsPrimitive from "@radix-ui/react-tabs"

import { cn } from "../../lib/utils"

const Tabs = TabsPrimitive.Root

const TabsList = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.List>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.List>
>(({ className, ...props }, ref) => {
  const innerRef = React.useRef<HTMLDivElement | null>(null);
  // Whether there's more to scroll to on each side — drives the edge
  // fade below. Scrolling makes overflowing tabs reachable, but with
  // nothing marking the row as scrollable it reads as "that's all the
  // tabs there are" (e.g. Audio/Links silently hidden past Videos).
  const [canScrollLeft, setCanScrollLeft] = React.useState(false);
  const [canScrollRight, setCanScrollRight] = React.useState(false);

  const updateScrollState = React.useCallback(() => {
    const el = innerRef.current;
    if (!el) return;
    setCanScrollLeft(el.scrollLeft > 2);
    setCanScrollRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 2);
  }, []);

  React.useEffect(() => {
    const el = innerRef.current;
    if (!el) return;

    updateScrollState();

    const resizeObserver = new ResizeObserver(updateScrollState);
    resizeObserver.observe(el);
    el.addEventListener('scroll', updateScrollState, { passive: true });

    return () => {
      resizeObserver.disconnect();
      el.removeEventListener('scroll', updateScrollState);
    };
  }, [updateScrollState]);

  return (
    <div className="relative max-w-full">
      <TabsPrimitive.List
        ref={(node) => {
          innerRef.current = node;
          if (typeof ref === 'function') ref(node);
          else if (ref) ref.current = node;
        }}
        className={cn(
          // Tab labels ("Video / Audio / Links", etc.) don't always fit a
          // phone screen — this was inline-flex with no overflow handling, so
          // rows of 3-5 tabs silently pushed past the page's own width on
          // mobile instead of scrolling. max-w-full + overflow-x-auto turns
          // that into a horizontally scrollable strip; justify-start (not
          // -center) avoids clipping the first tab off-screen when it does.
          "inline-flex h-9 max-w-full items-center justify-start overflow-x-auto rounded-lg bg-muted p-1 text-muted-foreground",
          className
        )}
        style={{
          // A colored overlay would need to match whatever background
          // color this instance's className passes in — this fades the
          // content itself instead (an alpha mask), so it looks right
          // regardless of the tab bar's actual color.
          maskImage:
            canScrollLeft || canScrollRight
              ? `linear-gradient(to right, ${canScrollLeft ? 'transparent, black 20px' : 'black'}, black ${canScrollRight ? 'calc(100% - 20px), transparent' : '100%'})`
              : undefined,
          WebkitMaskImage:
            canScrollLeft || canScrollRight
              ? `linear-gradient(to right, ${canScrollLeft ? 'transparent, black 20px' : 'black'}, black ${canScrollRight ? 'calc(100% - 20px), transparent' : '100%'})`
              : undefined,
        }}
        {...props}
      />
    </div>
  );
})
TabsList.displayName = TabsPrimitive.List.displayName

const TabsTrigger = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.Trigger>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Trigger>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.Trigger
    ref={ref}
    className={cn(
      // shrink-0: without it, a scrollable flex parent can still squeeze
      // these down to unreadable widths instead of letting them scroll.
      "inline-flex shrink-0 items-center justify-center whitespace-nowrap rounded-md px-3 py-1 text-sm font-medium ring-offset-background transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow",
      className
    )}
    {...props}
  />
))
TabsTrigger.displayName = TabsPrimitive.Trigger.displayName

const TabsContent = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Content>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.Content
    ref={ref}
    className={cn(
      "mt-2 ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
      className
    )}
    {...props}
  />
))
TabsContent.displayName = TabsPrimitive.Content.displayName

export { Tabs, TabsList, TabsTrigger, TabsContent }
