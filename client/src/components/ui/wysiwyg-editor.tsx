import { useMemo } from "react";
import ReactQuill from "react-quill";
import Quill from "quill";
import "react-quill/dist/quill.snow.css";
import "./wysiwyg-editor.css";
import { cn } from "@/lib/utils";

const Link = Quill.import("formats/link");
Link.sanitize = function (url: string) {
  // quill by default creates relative links if scheme is missing.
  if (!url.startsWith("http://") && !url.startsWith("https://")) {
    return `http://${url}`;
  }
  return url;
};

// class CustomLink extends Link {
//   static sanitize(url: string) {
//     // If user enters something without http/https, prepend https://
//     if (!/^https?:\/\//i.test(url)) {
//       return "https://" + url;
//     }
//     return super.sanitize(url);
//   }
// }

// // Register your custom link format globally
// Quill.register(CustomLink, true);

interface WysiwygEditorProps {
  value?: string;
  onChange?: (value: string) => void;
  placeholder?: string;
  className?: string;
  minHeight?: string;
  disabled?: boolean;
}

export function WysiwygEditor({
  value = "",
  onChange,
  placeholder = "Enter content...",
  className,
  minHeight = "300px",
  disabled = false,
}: WysiwygEditorProps) {
  // Simplified toolbar without problematic icons
  const modules = useMemo(
    () => ({
      toolbar: [
        [{ header: [1, 2, 3, false] }],
        ["bold", "italic", "underline"],
        [{ list: "ordered" }, { list: "bullet" }],
        ["link"],
        ["clean"],
      ],
    }),
    [],
  );

  const formats = [
    "header",
    "bold",
    "italic",
    "underline",
    "list",
    "bullet",
    "link",
  ];

  // Handle content changes
  const handleChange = (content: string) => {
    if (onChange) {
      onChange(content);
      console.log(content);
    }
  };

  return (
    <div className={cn("wysiwyg-editor", className)}>
      <ReactQuill
        theme="snow"
        value={value}
        onChange={handleChange}
        modules={modules}
        formats={formats}
        placeholder={placeholder}
        readOnly={disabled}
        style={{ minHeight }}
        className={cn(disabled && "opacity-50 cursor-not-allowed")}
      />
    </div>
  );
}
