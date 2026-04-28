import "./popup.css";
import { LegacyUploadApp } from "./components/LegacyUploadApp";

console.log("popup loaded");

function Popup() {
    console.log("Popup rendered");
    return <LegacyUploadApp />;
}

export default Popup;