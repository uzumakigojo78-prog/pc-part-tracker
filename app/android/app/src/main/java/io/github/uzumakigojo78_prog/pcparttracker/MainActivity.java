package io.github.uzumakigojo78_prog.pcparttracker;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(ScheduledBackupPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
